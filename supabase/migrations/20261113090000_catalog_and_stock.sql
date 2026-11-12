-- Iteration 2: products (with the per-product "must be returned" choice),
-- customers, receiving stock, and the stock ledger.
--
-- Stock is never stored as a number that gets edited. Every change is a row in
-- stock_movements, and the stock on hand is the sum of those rows.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- What a customer brings back: a crate, a cylinder, a pallet. Several products
-- can share one (every crate of drinks returns "Empty crate").
create table public.returnable_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  created_at timestamptz not null default now()
);

create unique index returnable_items_org_name_key
  on public.returnable_items (organization_id, lower(btrim(name)));

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  sku text check (sku is null or char_length(btrim(sku)) between 1 and 40),
  unit text not null check (char_length(btrim(unit)) between 1 and 30),
  selling_price numeric(14, 2) check (selling_price is null or selling_price >= 0),
  low_stock_threshold numeric(14, 2) not null default 0 check (low_stock_threshold >= 0),
  -- Set when dispatching this product means the customer owes something back.
  returnable_item_id uuid references public.returnable_items (id),
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index products_org_name_key
  on public.products (organization_id, lower(btrim(name)));
create unique index products_org_sku_key
  on public.products (organization_id, lower(btrim(sku))) where sku is not null;

-- Buying cost sits in its own table so that staff, who can read products,
-- cannot read what the business pays for them.
create table public.product_costs (
  product_id uuid primary key references public.products (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  cost_price numeric(14, 2) not null check (cost_price >= 0),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  phone text,
  area text,
  address text,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index customers_org_name_area_key
  on public.customers (organization_id, lower(btrim(name)), lower(coalesce(btrim(area), '')));

create table public.document_sequences (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sequence_key text not null,
  sequence_date date not null,
  last_value integer not null default 0,
  primary key (organization_id, sequence_key, sequence_date)
);

create table public.stock_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null references public.locations (id),
  receipt_no text not null,
  received_date date not null,
  supplier_name text,
  reference text,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, receipt_no)
);

create index stock_receipts_org_date_idx
  on public.stock_receipts (organization_id, received_date desc, created_at desc);

create table public.stock_receipt_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  receipt_id uuid not null references public.stock_receipts (id) on delete cascade,
  product_id uuid not null references public.products (id),
  quantity numeric(14, 2) not null check (quantity > 0),
  unique (receipt_id, product_id)
);

create type public.stock_movement_type as enum ('stock_in', 'sale', 'adjustment');

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null references public.locations (id),
  product_id uuid not null references public.products (id),
  movement_type public.stock_movement_type not null,
  qty_in numeric(14, 2) not null default 0 check (qty_in >= 0),
  qty_out numeric(14, 2) not null default 0 check (qty_out >= 0),
  -- The document that caused this movement, e.g. ('stock_receipt', <receipt id>).
  source_type text not null,
  source_id uuid not null,
  movement_date date not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint stock_movements_one_direction check ((qty_in > 0) <> (qty_out > 0))
);

create index stock_movements_level_idx
  on public.stock_movements (organization_id, product_id, location_id);
create index stock_movements_source_idx
  on public.stock_movements (source_type, source_id);

-- Stock on hand for every product at every location, including zero.
-- security_invoker makes the view obey the caller's row level security.
create view public.product_stock_levels
with (security_invoker = true) as
select
  p.organization_id,
  p.id as product_id,
  l.id as location_id,
  coalesce(sum(m.qty_in - m.qty_out), 0)::numeric(14, 2) as on_hand
from public.products p
join public.locations l on l.organization_id = p.organization_id
left join public.stock_movements m
  on m.product_id = p.id and m.location_id = l.id
group by p.organization_id, p.id, l.id;

-- The same, added up across all of a business's locations.
create view public.product_stock_totals
with (security_invoker = true) as
select
  p.organization_id,
  p.id as product_id,
  coalesce(sum(m.qty_in - m.qty_out), 0)::numeric(14, 2) as on_hand
from public.products p
left join public.stock_movements m on m.product_id = p.id
group by p.organization_id, p.id;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Per-business running numbers such as STK-20261113-0001.
create function public.next_document_number(
  p_organization_id uuid,
  p_sequence_key text,
  p_prefix text,
  p_date date
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next integer;
begin
  insert into public.document_sequences as s (organization_id, sequence_key, sequence_date, last_value)
  values (p_organization_id, p_sequence_key, p_date, 1)
  on conflict (organization_id, sequence_key, sequence_date)
  do update set last_value = s.last_value + 1
  returning s.last_value into v_next;

  return format('%s-%s-%s', p_prefix, to_char(p_date, 'YYYYMMDD'), lpad(v_next::text, 4, '0'));
end;
$$;

-- Today's date where the business is, not where the server is.
create function public.org_today(p_organization_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone o.timezone)::date
  from public.organizations o
  where o.id = p_organization_id;
$$;

-- ---------------------------------------------------------------------------
-- Write functions
-- ---------------------------------------------------------------------------

create function public.save_product(
  p_organization_id uuid,
  p_product_id uuid,
  p_name text,
  p_sku text,
  p_unit text,
  p_selling_price numeric,
  p_cost_price numeric,
  p_low_stock_threshold numeric,
  p_requires_return boolean,
  p_return_item_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_sku text := nullif(btrim(coalesce(p_sku, '')), '');
  v_unit text := btrim(coalesce(p_unit, ''));
  v_return_name text := btrim(coalesce(p_return_item_name, ''));
  v_threshold numeric := coalesce(p_low_stock_threshold, 0);
  v_returnable_id uuid;
  v_product_id uuid := p_product_id;
  v_old jsonb;
begin
  perform public.require_org_role(p_organization_id, array['owner', 'admin']::public.member_role[]);

  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'Product name must be between 2 and 80 characters.';
  end if;
  if char_length(v_unit) < 1 or char_length(v_unit) > 30 then
    raise exception 'Enter the unit you sell this product in, such as crate or pack.';
  end if;
  if v_sku is not null and char_length(v_sku) > 40 then
    raise exception 'Product code must be 40 characters or fewer.';
  end if;
  if p_selling_price < 0 or p_cost_price < 0 or v_threshold < 0 then
    raise exception 'Prices and the low stock level cannot be negative.';
  end if;

  if v_product_id is not null then
    select to_jsonb(p) into v_old
    from public.products p
    where p.id = v_product_id and p.organization_id = p_organization_id
    for update;

    if v_old is null then
      raise exception 'Product not found.';
    end if;
  end if;

  if exists (
    select 1 from public.products p
    where p.organization_id = p_organization_id
      and lower(btrim(p.name)) = lower(v_name)
      and p.id is distinct from v_product_id
  ) then
    raise exception 'You already have a product called %.', v_name;
  end if;

  if v_sku is not null and exists (
    select 1 from public.products p
    where p.organization_id = p_organization_id
      and lower(btrim(p.sku)) = lower(v_sku)
      and p.id is distinct from v_product_id
  ) then
    raise exception 'Product code % is already used by another product.', v_sku;
  end if;

  if coalesce(p_requires_return, false) then
    if char_length(v_return_name) < 2 or char_length(v_return_name) > 60 then
      raise exception 'Say what the customer must bring back, such as Empty crate.';
    end if;

    select r.id into v_returnable_id
    from public.returnable_items r
    where r.organization_id = p_organization_id
      and lower(btrim(r.name)) = lower(v_return_name);

    if v_returnable_id is null then
      insert into public.returnable_items (organization_id, name)
      values (p_organization_id, v_return_name)
      returning returnable_items.id into v_returnable_id;
    end if;
  end if;

  if v_product_id is null then
    insert into public.products (
      organization_id, name, sku, unit, selling_price, low_stock_threshold,
      returnable_item_id, created_by
    )
    values (
      p_organization_id, v_name, v_sku, v_unit, p_selling_price, v_threshold,
      v_returnable_id, auth.uid()
    )
    returning products.id into v_product_id;
  else
    update public.products p
    set name = v_name,
        sku = v_sku,
        unit = v_unit,
        selling_price = p_selling_price,
        low_stock_threshold = v_threshold,
        returnable_item_id = v_returnable_id,
        updated_at = now()
    where p.id = v_product_id;
  end if;

  if p_cost_price is null then
    delete from public.product_costs c where c.product_id = v_product_id;
  else
    insert into public.product_costs as c (product_id, organization_id, cost_price)
    values (v_product_id, p_organization_id, p_cost_price)
    on conflict (product_id)
    do update set cost_price = excluded.cost_price, updated_at = now();
  end if;

  perform public.write_audit_log(
    p_organization_id,
    case when p_product_id is null then 'create_product' else 'update_product' end,
    'products', v_product_id, v_old,
    jsonb_build_object(
      'name', v_name, 'sku', v_sku, 'unit', v_unit, 'selling_price', p_selling_price,
      'cost_price', p_cost_price, 'low_stock_threshold', v_threshold,
      'returnable_item', nullif(v_return_name, '')
    )
  );

  return v_product_id;
end;
$$;

create function public.set_product_active(p_product_id uuid, p_is_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product record;
begin
  select p.id, p.organization_id, p.is_active
  into v_product
  from public.products p
  where p.id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found.';
  end if;

  perform public.require_org_role(
    v_product.organization_id, array['owner', 'admin']::public.member_role[]
  );

  if p_is_active is null or v_product.is_active = p_is_active then
    return;
  end if;

  update public.products p
  set is_active = p_is_active, updated_at = now()
  where p.id = p_product_id;

  perform public.write_audit_log(
    v_product.organization_id,
    case when p_is_active then 'reactivate_product' else 'deactivate_product' end,
    'products', p_product_id,
    jsonb_build_object('is_active', v_product.is_active),
    jsonb_build_object('is_active', p_is_active)
  );
end;
$$;

-- Anyone on the team can add a customer; only owners and admins can edit one.
create function public.save_customer(
  p_organization_id uuid,
  p_customer_id uuid,
  p_name text,
  p_phone text,
  p_area text,
  p_address text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := nullif(left(btrim(coalesce(p_phone, '')), 30), '');
  v_area text := nullif(left(btrim(coalesce(p_area, '')), 80), '');
  v_address text := nullif(left(btrim(coalesce(p_address, '')), 200), '');
  v_customer_id uuid := p_customer_id;
  v_old jsonb;
begin
  if v_customer_id is null then
    perform public.require_org_role(
      p_organization_id, array['owner', 'admin', 'staff']::public.member_role[]
    );
  else
    perform public.require_org_role(
      p_organization_id, array['owner', 'admin']::public.member_role[]
    );

    select to_jsonb(c) into v_old
    from public.customers c
    where c.id = v_customer_id and c.organization_id = p_organization_id
    for update;

    if v_old is null then
      raise exception 'Customer not found.';
    end if;
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'Customer name must be between 2 and 80 characters.';
  end if;

  if exists (
    select 1 from public.customers c
    where c.organization_id = p_organization_id
      and lower(btrim(c.name)) = lower(v_name)
      and lower(coalesce(btrim(c.area), '')) = lower(coalesce(v_area, ''))
      and c.id is distinct from v_customer_id
  ) then
    raise exception 'You already have a customer called % in that area.', v_name;
  end if;

  if v_customer_id is null then
    insert into public.customers (organization_id, name, phone, area, address, created_by)
    values (p_organization_id, v_name, v_phone, v_area, v_address, auth.uid())
    returning customers.id into v_customer_id;
  else
    update public.customers c
    set name = v_name, phone = v_phone, area = v_area, address = v_address, updated_at = now()
    where c.id = v_customer_id;
  end if;

  perform public.write_audit_log(
    p_organization_id,
    case when p_customer_id is null then 'create_customer' else 'update_customer' end,
    'customers', v_customer_id, v_old,
    jsonb_build_object('name', v_name, 'phone', v_phone, 'area', v_area, 'address', v_address)
  );

  return v_customer_id;
end;
$$;

create function public.set_customer_active(p_customer_id uuid, p_is_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer record;
begin
  select c.id, c.organization_id, c.is_active
  into v_customer
  from public.customers c
  where c.id = p_customer_id
  for update;

  if not found then
    raise exception 'Customer not found.';
  end if;

  perform public.require_org_role(
    v_customer.organization_id, array['owner', 'admin']::public.member_role[]
  );

  if p_is_active is null or v_customer.is_active = p_is_active then
    return;
  end if;

  update public.customers c
  set is_active = p_is_active, updated_at = now()
  where c.id = p_customer_id;

  perform public.write_audit_log(
    v_customer.organization_id,
    case when p_is_active then 'reactivate_customer' else 'deactivate_customer' end,
    'customers', p_customer_id,
    jsonb_build_object('is_active', v_customer.is_active),
    jsonb_build_object('is_active', p_is_active)
  );
end;
$$;

-- Records goods arriving at a location and adds them to stock, as one unit:
-- either the receipt, its lines and the stock movements all save, or none do.
create function public.record_stock_receipt(
  p_organization_id uuid,
  p_location_id uuid,
  p_received_date date,
  p_supplier_name text,
  p_reference text,
  p_note text,
  p_items jsonb
)
returns table (id uuid, receipt_no text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt_id uuid;
  v_receipt_no text;
  v_bad_product text;
begin
  perform public.require_org_role(
    p_organization_id, array['owner', 'admin', 'staff']::public.member_role[]
  );

  if p_received_date is null then
    raise exception 'Enter the date the stock arrived.';
  end if;
  if p_received_date > public.org_today(p_organization_id) then
    raise exception 'The date the stock arrived cannot be in the future.';
  end if;

  if not exists (
    select 1 from public.locations l
    where l.id = p_location_id
      and l.organization_id = p_organization_id
      and l.is_active
  ) then
    raise exception 'Choose one of your locations.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one product.';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'A single stock receipt can hold up to 200 products.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric)
    where item.product_id is null or item.quantity is null or item.quantity <= 0
  ) then
    raise exception 'Every line needs a product and a quantity greater than zero.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric)
    group by item.product_id
    having count(*) > 1
  ) then
    raise exception 'A product is listed more than once. Combine it into one line.';
  end if;

  -- Every product must belong to this business and be active.
  select coalesce(p.name, 'A product')
  into v_bad_product
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric)
  left join public.products p
    on p.id = item.product_id and p.organization_id = p_organization_id
  where p.id is null or not p.is_active
  limit 1;

  if found then
    raise exception '% is not an active product of this business.', v_bad_product;
  end if;

  v_receipt_no := public.next_document_number(p_organization_id, 'stock_receipt', 'STK', p_received_date);

  insert into public.stock_receipts (
    organization_id, location_id, receipt_no, received_date, supplier_name, reference, note, created_by
  )
  values (
    p_organization_id, p_location_id, v_receipt_no, p_received_date,
    nullif(left(btrim(coalesce(p_supplier_name, '')), 80), ''),
    nullif(left(btrim(coalesce(p_reference, '')), 80), ''),
    nullif(left(btrim(coalesce(p_note, '')), 500), ''),
    auth.uid()
  )
  returning stock_receipts.id into v_receipt_id;

  insert into public.stock_receipt_items (organization_id, receipt_id, product_id, quantity)
  select p_organization_id, v_receipt_id, item.product_id, item.quantity
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric);

  insert into public.stock_movements (
    organization_id, location_id, product_id, movement_type, qty_in,
    source_type, source_id, movement_date, created_by
  )
  select
    p_organization_id, p_location_id, item.product_id, 'stock_in', item.quantity,
    'stock_receipt', v_receipt_id, p_received_date, auth.uid()
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric);

  perform public.write_audit_log(
    p_organization_id, 'record_stock_receipt', 'stock_receipts', v_receipt_id, null,
    jsonb_build_object(
      'receipt_no', v_receipt_no, 'received_date', p_received_date,
      'location_id', p_location_id, 'items', p_items
    )
  );

  return query select v_receipt_id, v_receipt_no;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.returnable_items enable row level security;
alter table public.products enable row level security;
alter table public.product_costs enable row level security;
alter table public.customers enable row level security;
alter table public.document_sequences enable row level security;
alter table public.stock_receipts enable row level security;
alter table public.stock_receipt_items enable row level security;
alter table public.stock_movements enable row level security;

revoke all on
  public.returnable_items,
  public.products,
  public.product_costs,
  public.customers,
  public.document_sequences,
  public.stock_receipts,
  public.stock_receipt_items,
  public.stock_movements,
  public.product_stock_levels,
  public.product_stock_totals
from anon, authenticated;

grant select on
  public.returnable_items,
  public.products,
  public.product_costs,
  public.customers,
  public.stock_receipts,
  public.stock_receipt_items,
  public.stock_movements,
  public.product_stock_levels,
  public.product_stock_totals
to authenticated;

create policy "members read returnable items"
on public.returnable_items for select to authenticated
using (public.is_org_member(organization_id));

create policy "members read products"
on public.products for select to authenticated
using (public.is_org_member(organization_id));

create policy "admins read product costs"
on public.product_costs for select to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));

create policy "members read customers"
on public.customers for select to authenticated
using (public.is_org_member(organization_id));

create policy "members read stock receipts"
on public.stock_receipts for select to authenticated
using (public.is_org_member(organization_id));

create policy "members read stock receipt items"
on public.stock_receipt_items for select to authenticated
using (public.is_org_member(organization_id));

create policy "members read stock movements"
on public.stock_movements for select to authenticated
using (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke all on function public.next_document_number(uuid, text, text, date) from public, anon, authenticated;
revoke all on function public.org_today(uuid) from public, anon, authenticated;

revoke all on function public.save_product(uuid, uuid, text, text, text, numeric, numeric, numeric, boolean, text) from public, anon;
revoke all on function public.set_product_active(uuid, boolean) from public, anon;
revoke all on function public.save_customer(uuid, uuid, text, text, text, text) from public, anon;
revoke all on function public.set_customer_active(uuid, boolean) from public, anon;
revoke all on function public.record_stock_receipt(uuid, uuid, date, text, text, text, jsonb) from public, anon;

grant execute on function public.save_product(uuid, uuid, text, text, text, numeric, numeric, numeric, boolean, text) to authenticated;
grant execute on function public.set_product_active(uuid, boolean) to authenticated;
grant execute on function public.save_customer(uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.set_customer_active(uuid, boolean) to authenticated;
grant execute on function public.record_stock_receipt(uuid, uuid, date, text, text, text, jsonb) to authenticated;
