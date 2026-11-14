-- Iteration 7: serial-numbered products, counter sales and walk-in buyers.
--
-- A product can be switched to "track each unit by serial number" (phones,
-- laptops, generators). Each unit is entered when stock arrives, with its
-- colour and condition, and is followed through to the order that sold it.
-- The stock ledger is unchanged: for a tracked product, the stock on hand at
-- a location always equals the number of its units in stock there.
--
-- An order can now be handed over at the counter instead of going on a trip,
-- and can be sold to a walk-in buyer who is not a saved customer.

create type public.unit_condition as enum ('brand_new', 'uk_used', 'nigerian_used');
create type public.unit_status as enum ('in_stock', 'reserved', 'sold');

alter table public.products
  add column tracks_serials boolean not null default false,
  add column warranty_months integer check (warranty_months between 1 and 120);

alter table public.orders
  alter column customer_id drop not null,
  add column buyer_name text check (buyer_name is null or char_length(buyer_name) between 1 and 80),
  add column buyer_phone text check (buyer_phone is null or char_length(buyer_phone) between 1 and 30),
  add column handed_over_at timestamptz;

create table public.product_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  product_id uuid not null references public.products (id),
  location_id uuid not null references public.locations (id),
  receipt_id uuid not null references public.stock_receipts (id) on delete cascade,
  -- Stored without spaces and in capitals, so "356 789 1012" and "3567891012" match.
  serial_no text not null check (serial_no ~ '^\S{3,40}$'),
  colour text check (colour is null or char_length(colour) between 1 and 30),
  condition public.unit_condition not null default 'brand_new',
  status public.unit_status not null default 'in_stock',
  order_id uuid references public.orders (id),
  sold_at timestamptz,
  created_at timestamptz not null default now(),
  constraint product_units_order_matches_status check ((status = 'in_stock') = (order_id is null))
);

-- A serial number can be in stock only once. A sold unit can come back later
-- (a trade-in, say) and be stocked again, keeping the history of both.
create unique index product_units_live_serial_key
  on public.product_units (organization_id, serial_no) where status <> 'sold';
create index product_units_stock_idx
  on public.product_units (organization_id, product_id, location_id, status);
create index product_units_order_idx on public.product_units (order_id) where order_id is not null;
create index product_units_serial_idx on public.product_units (organization_id, serial_no);

alter table public.product_units enable row level security;
revoke all on public.product_units from anon, authenticated;
grant select on public.product_units to authenticated;

create policy "members read product units"
on public.product_units for select to authenticated
using (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- Order summaries: walk-in buyers have no saved customer.
-- ---------------------------------------------------------------------------

create or replace view public.order_summaries
with (security_invoker = true) as
select
  o.id,
  o.organization_id,
  o.location_id,
  o.order_no,
  o.order_date,
  o.status,
  o.payment_type,
  o.customer_id,
  coalesce(c.name, o.buyer_name, 'Walk-in buyer') as customer_name,
  c.area as customer_area,
  coalesce(t.total_quantity, 0)::numeric(14, 2) as total_quantity,
  coalesce(t.total_amount, 0)::numeric(16, 2) as total_amount,
  coalesce(t.has_returns, false) as has_returns,
  dt.id as trip_id,
  dt.trip_no,
  o.created_at,
  o.voided_at,
  coalesce(c.phone, o.buyer_phone) as customer_phone,
  o.handed_over_at
from public.orders o
left join public.customers c on c.id = o.customer_id
left join lateral (
  select
    sum(i.quantity) as total_quantity,
    sum(i.line_total) as total_amount,
    bool_or(i.returnable_item_id is not null) as has_returns
  from public.order_items i
  where i.order_id = o.id
) t on true
left join public.dispatch_trip_orders dto on dto.order_id = o.id
left join public.dispatch_trips dt on dt.id = dto.trip_id;

-- ---------------------------------------------------------------------------
-- Products: the serial-number switch and a warranty period
-- ---------------------------------------------------------------------------

drop function public.save_product(uuid, uuid, text, text, text, numeric, numeric, numeric, boolean, text);

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
  p_return_item_name text,
  p_tracks_serials boolean default false,
  p_warranty_months integer default null
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
  v_tracks boolean := coalesce(p_tracks_serials, false);
  v_returnable_id uuid;
  v_product_id uuid := p_product_id;
  v_old jsonb;
  v_on_hand numeric;
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
  if p_warranty_months is not null and (p_warranty_months < 1 or p_warranty_months > 120) then
    raise exception 'Warranty must be between 1 and 120 months.';
  end if;

  if v_product_id is not null then
    select to_jsonb(p) into v_old
    from public.products p
    where p.id = v_product_id and p.organization_id = p_organization_id
    for update;

    if v_old is null then
      raise exception 'Product not found.';
    end if;

    -- Stock already counted one way cannot suddenly be counted the other way.
    if (v_old ->> 'tracks_serials')::boolean is distinct from v_tracks then
      select coalesce(sum(m.qty_in - m.qty_out), 0) into v_on_hand
      from public.stock_movements m
      where m.product_id = v_product_id;

      if v_on_hand <> 0 or exists (
        select 1 from public.product_units u
        where u.product_id = v_product_id and u.status <> 'sold'
      ) then
        raise exception 'Serial numbers can only be switched % while % has no stock or open orders. It has % in stock now.',
          case when v_tracks then 'on' else 'off' end, v_name, trim_scale(v_on_hand);
      end if;
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
      returnable_item_id, tracks_serials, warranty_months, created_by
    )
    values (
      p_organization_id, v_name, v_sku, v_unit, p_selling_price, v_threshold,
      v_returnable_id, v_tracks, p_warranty_months, auth.uid()
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
        tracks_serials = v_tracks,
        warranty_months = p_warranty_months,
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
      'returnable_item', nullif(v_return_name, ''),
      'tracks_serials', v_tracks, 'warranty_months', p_warranty_months
    )
  );

  return v_product_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Receiving stock: serial-numbered products list each unit
-- ---------------------------------------------------------------------------

-- p_items: [{ "product_id", "quantity" }] for ordinary products, and
-- [{ "product_id", "units": [{ "serial", "colour", "condition" }] }] for
-- serial-numbered ones, whose quantity is the number of units.
create or replace function public.record_stock_receipt(
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
  v_lines jsonb;
  v_units jsonb;
  v_row record;
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
  if exists (select 1 from jsonb_array_elements(p_items) i where nullif(i ->> 'product_id', '') is null) then
    raise exception 'Every line needs a product and a quantity greater than zero.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', i ->> 'product_id',
      'quantity', case
        when jsonb_typeof(i -> 'units') = 'array' then jsonb_array_length(i -> 'units')
        else (i ->> 'quantity')::numeric
      end,
      -- A line with no list of units must count as "no units", not "unknown".
      'has_units', coalesce(jsonb_typeof(i -> 'units') = 'array', false)
    )), '[]'::jsonb)
  into v_lines
  from jsonb_array_elements(p_items) i;

  select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', i ->> 'product_id',
      'serial', upper(regexp_replace(coalesce(u ->> 'serial', ''), '\s', '', 'g')),
      'colour', nullif(btrim(coalesce(u ->> 'colour', '')), ''),
      'condition', coalesce(nullif(u ->> 'condition', ''), 'brand_new')
    )), '[]'::jsonb)
  into v_units
  from jsonb_array_elements(p_items) i,
       jsonb_array_elements(case when jsonb_typeof(i -> 'units') = 'array' then i -> 'units' else '[]'::jsonb end) u;

  if jsonb_array_length(v_units) > 500 then
    raise exception 'A single stock receipt can hold up to 500 serial numbers.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_lines) as item(product_id uuid, quantity numeric, has_units boolean)
    group by item.product_id
    having count(*) > 1
  ) then
    raise exception 'A product is listed more than once. Combine it into one line.';
  end if;

  -- Every product must belong to this business and be active.
  select coalesce(p.name, 'A product') as name
  into v_row
  from jsonb_to_recordset(v_lines) as item(product_id uuid, quantity numeric, has_units boolean)
  left join public.products p
    on p.id = item.product_id and p.organization_id = p_organization_id
  where p.id is null or not p.is_active
  limit 1;

  if found then
    raise exception '% is not an active product of this business.', v_row.name;
  end if;

  select p.name into v_row
  from jsonb_to_recordset(v_lines) as item(product_id uuid, quantity numeric, has_units boolean)
  join public.products p on p.id = item.product_id
  where p.tracks_serials and (not item.has_units or item.quantity = 0)
  limit 1;
  if found then
    raise exception 'Enter the serial number of each % received.', v_row.name;
  end if;

  select p.name into v_row
  from jsonb_to_recordset(v_lines) as item(product_id uuid, quantity numeric, has_units boolean)
  join public.products p on p.id = item.product_id
  where not p.tracks_serials and item.has_units and item.quantity > 0
  limit 1;
  if found then
    raise exception '% is not tracked by serial number. Enter a quantity instead.', v_row.name;
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_lines) as item(product_id uuid, quantity numeric, has_units boolean)
    where item.quantity is null or item.quantity <= 0
  ) then
    raise exception 'Every line needs a product and a quantity greater than zero.';
  end if;

  -- The units themselves.
  if exists (
    select 1 from jsonb_to_recordset(v_units) as u(product_id uuid, serial text, colour text, condition text)
    where char_length(u.serial) not between 3 and 40
  ) then
    raise exception 'Serial numbers must be 3 to 40 characters long.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(v_units) as u(product_id uuid, serial text, colour text, condition text)
    where char_length(u.colour) > 30
  ) then
    raise exception 'Colours must be 30 characters or fewer.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(v_units) as u(product_id uuid, serial text, colour text, condition text)
    where u.condition not in ('brand_new', 'uk_used', 'nigerian_used')
  ) then
    raise exception 'Choose Brand new, UK used or Nigerian used for every unit.';
  end if;

  select u.serial into v_row
  from jsonb_to_recordset(v_units) as u(product_id uuid, serial text, colour text, condition text)
  group by u.serial
  having count(*) > 1
  limit 1;
  if found then
    raise exception 'Serial number % is entered twice.', v_row.serial;
  end if;

  select u.serial_no as serial into v_row
  from public.product_units u
  join jsonb_to_recordset(v_units) as n(product_id uuid, serial text, colour text, condition text)
    on n.serial = u.serial_no
  where u.organization_id = p_organization_id and u.status <> 'sold'
  limit 1;
  if found then
    raise exception 'Serial number % is already in your stock or on an order.', v_row.serial;
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
  from jsonb_to_recordset(v_lines) as item(product_id uuid, quantity numeric, has_units boolean);

  insert into public.stock_movements (
    organization_id, location_id, product_id, movement_type, qty_in,
    source_type, source_id, movement_date, created_by
  )
  select
    p_organization_id, p_location_id, item.product_id, 'stock_in', item.quantity,
    'stock_receipt', v_receipt_id, p_received_date, auth.uid()
  from jsonb_to_recordset(v_lines) as item(product_id uuid, quantity numeric, has_units boolean);

  insert into public.product_units (
    organization_id, product_id, location_id, receipt_id, serial_no, colour, condition
  )
  select
    p_organization_id, u.product_id, p_location_id, v_receipt_id, u.serial, u.colour,
    u.condition::public.unit_condition
  from jsonb_to_recordset(v_units) as u(product_id uuid, serial text, colour text, condition text);

  perform public.write_audit_log(
    p_organization_id, 'record_stock_receipt', 'stock_receipts', v_receipt_id, null,
    jsonb_build_object(
      'receipt_no', v_receipt_no, 'received_date', p_received_date,
      'location_id', p_location_id, 'items', v_lines, 'units', v_units
    )
  );

  return query select v_receipt_id, v_receipt_no;
end;
$$;

-- ---------------------------------------------------------------------------
-- Orders: walk-in buyers, serial-numbered units, handing over at the counter
-- ---------------------------------------------------------------------------

create or replace function public.assert_order_header(
  p_organization_id uuid,
  p_location_id uuid,
  p_order_date date,
  p_customer_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_order_date is null then
    raise exception 'Enter the order date.';
  end if;
  if p_order_date > public.org_today(p_organization_id) then
    raise exception 'The order date cannot be in the future.';
  end if;

  if not exists (
    select 1 from public.locations l
    where l.id = p_location_id and l.organization_id = p_organization_id and l.is_active
  ) then
    raise exception 'Choose one of your locations.';
  end if;

  -- No customer means a walk-in buyer.
  if p_customer_id is not null and not exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.organization_id = p_organization_id and c.is_active
  ) then
    raise exception 'Choose one of your active customers.';
  end if;
end;
$$;

-- p_items: [{ "product_id", "quantity" }] for ordinary products, and
-- [{ "product_id", "unit_ids": [...] }] for serial-numbered ones.
create or replace function public.write_order_items(
  p_organization_id uuid,
  p_order_id uuid,
  p_location_id uuid,
  p_order_date date,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_lines jsonb;
  v_unit_ids uuid[];
  v_walk_in boolean;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one product.';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'A single order can hold up to 200 products.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) i where nullif(i ->> 'product_id', '') is null) then
    raise exception 'Every line needs a product and a quantity greater than zero.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', i ->> 'product_id',
      'quantity', case
        when jsonb_typeof(i -> 'unit_ids') = 'array' then jsonb_array_length(i -> 'unit_ids')
        else (i ->> 'quantity')::numeric
      end,
      'unit_ids', case when jsonb_typeof(i -> 'unit_ids') = 'array' then i -> 'unit_ids' else '[]'::jsonb end
    )), '[]'::jsonb)
  into v_lines
  from jsonb_array_elements(p_items) i;

  if exists (
    select 1
    from jsonb_to_recordset(v_lines) as item(product_id uuid, quantity numeric, unit_ids jsonb)
    group by item.product_id
    having count(*) > 1
  ) then
    raise exception 'A product is listed more than once. Combine it into one line.';
  end if;

  -- Lock the products involved, in a fixed order, so two orders saved at the
  -- same moment cannot both take the last of the stock.
  perform 1
  from public.products p
  where p.organization_id = p_organization_id
    and p.id in (
      select item.product_id
      from jsonb_to_recordset(v_lines) as item(product_id uuid, quantity numeric, unit_ids jsonb)
    )
  order by p.id
  for update;

  select coalesce(p.name, 'A product') as name
  into v_row
  from jsonb_to_recordset(v_lines) as item(product_id uuid, quantity numeric, unit_ids jsonb)
  left join public.products p
    on p.id = item.product_id and p.organization_id = p_organization_id
  where p.id is null or not p.is_active
  limit 1;
  if found then
    raise exception '% is not an active product of this business.', v_row.name;
  end if;

  select p.name into v_row
  from jsonb_to_recordset(v_lines) as item(product_id uuid, quantity numeric, unit_ids jsonb)
  join public.products p on p.id = item.product_id
  where p.selling_price is null
  limit 1;
  if found then
    raise exception 'Ask an owner or admin to set a selling price for % first.', v_row.name;
  end if;

  select p.name into v_row
  from jsonb_to_recordset(v_lines) as item(product_id uuid, quantity numeric, unit_ids jsonb)
  join public.products p on p.id = item.product_id
  where p.tracks_serials and jsonb_array_length(item.unit_ids) = 0
  limit 1;
  if found then
    raise exception 'Choose which % are going out, by serial number.', v_row.name;
  end if;

  select p.name into v_row
  from jsonb_to_recordset(v_lines) as item(product_id uuid, quantity numeric, unit_ids jsonb)
  join public.products p on p.id = item.product_id
  where not p.tracks_serials and jsonb_array_length(item.unit_ids) > 0
  limit 1;
  if found then
    raise exception '% is not tracked by serial number. Enter a quantity instead.', v_row.name;
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_lines) as item(product_id uuid, quantity numeric, unit_ids jsonb)
    where item.quantity is null or item.quantity <= 0
  ) then
    raise exception 'Every line needs a product and a quantity greater than zero.';
  end if;

  -- A walk-in buyer is not on the books, so nothing can be owed back by them.
  select o.customer_id is null into v_walk_in from public.orders o where o.id = p_order_id;
  if v_walk_in then
    select p.name into v_row
    from jsonb_to_recordset(v_lines) as item(product_id uuid, quantity numeric, unit_ids jsonb)
    join public.products p on p.id = item.product_id
    where p.returnable_item_id is not null
    limit 1;
    if found then
      raise exception '% must be brought back, so it can only be sold to a saved customer.', v_row.name;
    end if;
  end if;

  -- Hand back what this order was holding, then check against what is left.
  update public.product_units u
  set status = 'in_stock', order_id = null
  where u.order_id = p_order_id and u.status = 'reserved';

  delete from public.stock_movements m
  where m.source_type = 'order' and m.source_id = p_order_id;

  select coalesce(array_agg(x::uuid), '{}'::uuid[])
  into v_unit_ids
  from jsonb_to_recordset(v_lines) as item(product_id uuid, quantity numeric, unit_ids jsonb),
       jsonb_array_elements_text(item.unit_ids) x;

  if cardinality(v_unit_ids) <> (select count(distinct x) from unnest(v_unit_ids) x) then
    raise exception 'The same unit is chosen twice.';
  end if;

  perform 1
  from public.product_units u
  where u.id = any (v_unit_ids)
  order by u.id
  for update;

  if exists (
    select 1
    from jsonb_to_recordset(v_lines) as item(product_id uuid, quantity numeric, unit_ids jsonb)
    cross join jsonb_array_elements_text(item.unit_ids) x
    left join public.product_units u
      on u.id = x::uuid
      and u.organization_id = p_organization_id
      and u.product_id = item.product_id
      and u.location_id = p_location_id
      and u.status = 'in_stock'
    where u.id is null
  ) then
    raise exception 'One of the chosen units has been sold, is on another order, or is at another location. Refresh and choose again.';
  end if;

  for v_row in
    select
      p.name,
      item.quantity as requested,
      coalesce((
        select sum(m.qty_in - m.qty_out)
        from public.stock_movements m
        where m.product_id = item.product_id and m.location_id = p_location_id
      ), 0) as available
    from jsonb_to_recordset(v_lines) as item(product_id uuid, quantity numeric, unit_ids jsonb)
    join public.products p on p.id = item.product_id
  loop
    if v_row.available < v_row.requested then
      raise exception 'Not enough stock for %. Available: %, requested: %.',
        v_row.name, trim_scale(v_row.available), trim_scale(v_row.requested);
    end if;
  end loop;

  delete from public.order_items i where i.order_id = p_order_id;

  insert into public.order_items (
    organization_id, order_id, product_id, quantity, unit_price, returnable_item_id
  )
  select p_organization_id, p_order_id, p.id, item.quantity, p.selling_price, p.returnable_item_id
  from jsonb_to_recordset(v_lines) as item(product_id uuid, quantity numeric, unit_ids jsonb)
  join public.products p on p.id = item.product_id;

  insert into public.stock_movements (
    organization_id, location_id, product_id, movement_type, qty_out,
    source_type, source_id, movement_date, created_by
  )
  select
    p_organization_id, p_location_id, item.product_id, 'sale', item.quantity,
    'order', p_order_id, p_order_date, auth.uid()
  from jsonb_to_recordset(v_lines) as item(product_id uuid, quantity numeric, unit_ids jsonb);

  update public.product_units u
  set status = 'reserved', order_id = p_order_id
  where u.id = any (v_unit_ids);
end;
$$;

-- Completes a waiting order on the spot: the buyer takes it away now.
create function public.hand_over_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
begin
  select o.id, o.organization_id, o.customer_id, o.status, o.order_no
  into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  perform public.require_org_role(
    v_order.organization_id, array['owner', 'admin', 'staff']::public.member_role[]
  );

  if v_order.status <> 'pending' then
    raise exception 'Only an order still waiting for dispatch can be handed over.';
  end if;

  -- From this moment the customer owes any containers back.
  insert into public.returnable_movements (
    organization_id, returnable_item_id, customer_id, owed_delta,
    movement_type, source_type, source_id, movement_date, created_by
  )
  select
    v_order.organization_id, i.returnable_item_id, v_order.customer_id, sum(i.quantity),
    'dispatch', 'order', p_order_id, public.org_today(v_order.organization_id), auth.uid()
  from public.order_items i
  where i.order_id = p_order_id and i.returnable_item_id is not null
  group by i.returnable_item_id;

  update public.product_units u
  set status = 'sold', sold_at = now()
  where u.order_id = p_order_id;

  update public.orders o
  set status = 'completed', handed_over_at = now(), updated_at = now()
  where o.id = p_order_id;

  perform public.write_audit_log(
    v_order.organization_id, 'hand_over_order', 'orders', p_order_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('order_no', v_order.order_no, 'status', 'completed')
  );
end;
$$;

drop function public.create_order(uuid, uuid, date, uuid, public.payment_type, text, jsonb);

create function public.create_order(
  p_organization_id uuid,
  p_location_id uuid,
  p_order_date date,
  p_customer_id uuid,
  p_payment_type public.payment_type,
  p_note text,
  p_items jsonb,
  p_handed_over boolean default false,
  p_buyer_name text default null,
  p_buyer_phone text default null
)
returns table (id uuid, order_no text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_order_no text;
begin
  perform public.require_org_role(
    p_organization_id, array['owner', 'admin', 'staff']::public.member_role[]
  );
  perform public.assert_order_header(p_organization_id, p_location_id, p_order_date, p_customer_id);

  v_order_no := public.next_document_number(p_organization_id, 'order', 'ORD', p_order_date);

  insert into public.orders (
    organization_id, location_id, order_no, order_date, customer_id, payment_type, note,
    buyer_name, buyer_phone, created_by
  )
  values (
    p_organization_id, p_location_id, v_order_no, p_order_date, p_customer_id,
    coalesce(p_payment_type, 'cash'),
    nullif(left(btrim(coalesce(p_note, '')), 500), ''),
    case when p_customer_id is null then nullif(left(btrim(coalesce(p_buyer_name, '')), 80), '') end,
    case when p_customer_id is null then nullif(left(btrim(coalesce(p_buyer_phone, '')), 30), '') end,
    auth.uid()
  )
  returning orders.id into v_order_id;

  perform public.write_order_items(p_organization_id, v_order_id, p_location_id, p_order_date, p_items);

  perform public.write_audit_log(
    p_organization_id, 'create_order', 'orders', v_order_id, null,
    jsonb_build_object(
      'order_no', v_order_no, 'order_date', p_order_date, 'customer_id', p_customer_id,
      'name', case when p_customer_id is null then coalesce(nullif(btrim(p_buyer_name), ''), 'Walk-in buyer') end,
      'payment_type', coalesce(p_payment_type, 'cash'), 'items', p_items
    )
  );

  if coalesce(p_handed_over, false) then
    perform public.hand_over_order(v_order_id);
  end if;

  return query select v_order_id, v_order_no;
end;
$$;

drop function public.update_order(uuid, date, uuid, public.payment_type, text, jsonb);

create function public.update_order(
  p_order_id uuid,
  p_order_date date,
  p_customer_id uuid,
  p_payment_type public.payment_type,
  p_note text,
  p_items jsonb,
  p_buyer_name text default null,
  p_buyer_phone text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_old_items jsonb;
begin
  select o.id, o.organization_id, o.location_id, o.status, o.order_date, o.customer_id
  into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  perform public.require_org_role(
    v_order.organization_id, array['owner', 'admin', 'staff']::public.member_role[]
  );

  if v_order.status <> 'pending' then
    raise exception 'Only an order still waiting for dispatch can be changed.';
  end if;

  perform public.assert_order_header(
    v_order.organization_id, v_order.location_id, p_order_date, p_customer_id
  );

  select jsonb_agg(jsonb_build_object('product_id', i.product_id, 'quantity', i.quantity))
  into v_old_items
  from public.order_items i
  where i.order_id = p_order_id;

  update public.orders o
  set order_date = p_order_date,
      customer_id = p_customer_id,
      buyer_name = case when p_customer_id is null then nullif(left(btrim(coalesce(p_buyer_name, '')), 80), '') end,
      buyer_phone = case when p_customer_id is null then nullif(left(btrim(coalesce(p_buyer_phone, '')), 30), '') end,
      payment_type = coalesce(p_payment_type, 'cash'),
      note = nullif(left(btrim(coalesce(p_note, '')), 500), ''),
      updated_at = now()
  where o.id = p_order_id;

  perform public.write_order_items(
    v_order.organization_id, p_order_id, v_order.location_id, p_order_date, p_items
  );

  perform public.write_audit_log(
    v_order.organization_id, 'update_order', 'orders', p_order_id,
    jsonb_build_object(
      'order_date', v_order.order_date, 'customer_id', v_order.customer_id, 'items', v_old_items
    ),
    jsonb_build_object('order_date', p_order_date, 'customer_id', p_customer_id, 'items', p_items)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Units follow their order: sold when it leaves, back in stock when it is
-- cancelled or voided. Each function below is its previous version with that
-- added; nothing else changes.
-- ---------------------------------------------------------------------------

create or replace function public.cancel_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
begin
  select o.id, o.organization_id, o.status, o.order_no
  into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  perform public.require_org_role(
    v_order.organization_id, array['owner', 'admin', 'staff']::public.member_role[]
  );

  if v_order.status <> 'pending' then
    raise exception 'Only an order still waiting for dispatch can be cancelled.';
  end if;

  delete from public.stock_movements m
  where m.source_type = 'order' and m.source_id = p_order_id;

  update public.product_units u
  set status = 'in_stock', order_id = null
  where u.order_id = p_order_id;

  update public.orders o
  set status = 'cancelled', updated_at = now()
  where o.id = p_order_id;

  perform public.write_audit_log(
    v_order.organization_id, 'cancel_order', 'orders', p_order_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'cancelled', 'order_no', v_order.order_no)
  );
end;
$$;

create or replace function public.dispatch_trip(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip record;
  v_order_ids uuid[];
  v_awaiting_returns uuid[];
begin
  select t.id, t.organization_id, t.status, t.trip_no, t.dispatch_date
  into v_trip
  from public.dispatch_trips t
  where t.id = p_trip_id
  for update;

  if not found then
    raise exception 'Trip not found.';
  end if;

  perform public.require_org_role(
    v_trip.organization_id, array['owner', 'admin', 'staff']::public.member_role[]
  );

  if v_trip.status <> 'draft' then
    raise exception 'This trip has already been dispatched or cancelled.';
  end if;

  select array_agg(dto.order_id) into v_order_ids
  from public.dispatch_trip_orders dto
  where dto.trip_id = p_trip_id;

  if v_order_ids is null then
    raise exception 'This trip has no orders on it.';
  end if;

  select coalesce(array_agg(distinct i.order_id), '{}'::uuid[]) into v_awaiting_returns
  from public.order_items i
  where i.order_id = any (v_order_ids)
    and i.returnable_item_id is not null;

  -- From this moment the customer owes the containers back.
  insert into public.returnable_movements (
    organization_id, returnable_item_id, customer_id, owed_delta,
    movement_type, source_type, source_id, movement_date, created_by
  )
  select
    o.organization_id, i.returnable_item_id, o.customer_id, sum(i.quantity),
    'dispatch', 'order', o.id, v_trip.dispatch_date, auth.uid()
  from public.order_items i
  join public.orders o on o.id = i.order_id
  where i.order_id = any (v_awaiting_returns)
    and i.returnable_item_id is not null
  group by o.organization_id, i.returnable_item_id, o.customer_id, o.id;

  update public.product_units u
  set status = 'sold', sold_at = now()
  where u.order_id = any (v_order_ids);

  update public.orders o
  set status = case when o.id = any (v_awaiting_returns) then 'dispatched' else 'completed' end::public.order_status,
      updated_at = now()
  where o.id = any (v_order_ids);

  update public.dispatch_trips t
  set status = case when cardinality(v_awaiting_returns) > 0 then 'dispatched' else 'completed' end::public.trip_status,
      dispatched_at = now(),
      updated_at = now()
  where t.id = p_trip_id;

  perform public.write_audit_log(
    v_trip.organization_id, 'dispatch_trip', 'dispatch_trips', p_trip_id,
    jsonb_build_object('status', 'draft'),
    jsonb_build_object(
      'trip_no', v_trip.trip_no, 'order_count', cardinality(v_order_ids),
      'orders_awaiting_returns', cardinality(v_awaiting_returns)
    )
  );
end;
$$;

create or replace function public.void_order(p_order_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_reason text;
  v_trip record;
  v_snapshot jsonb;
  v_serial text;
begin
  select o.id, o.organization_id, o.location_id, o.customer_id, o.status, o.order_no, o.voided_at
  into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  perform public.require_org_role(v_order.organization_id, array['owner', 'admin']::public.member_role[]);
  v_reason := public.require_reason(p_reason);

  if v_order.voided_at is not null then
    raise exception 'This order has already been voided.';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'This order was cancelled, so there is nothing to void.';
  end if;

  select t.id, t.status
  into v_trip
  from public.dispatch_trip_orders dto
  join public.dispatch_trips t on t.id = dto.trip_id
  where dto.order_id = p_order_id
  for update of t;

  select jsonb_build_object(
    'order_no', v_order.order_no,
    'status', v_order.status,
    'items', (
      select jsonb_agg(jsonb_build_object('product_id', i.product_id, 'quantity', i.quantity, 'unit_price', i.unit_price))
      from public.order_items i where i.order_id = p_order_id
    ),
    'returned', (
      select jsonb_agg(jsonb_build_object('returnable_item_id', l.returnable_item_id, 'returned', l.returned_quantity))
      from public.trip_return_lines l where l.order_id = p_order_id
    )
  ) into v_snapshot;

  -- The goods go back into stock.
  delete from public.stock_movements m
  where m.source_type = 'order' and m.source_id = p_order_id;

  -- Once dispatched, the order put a debt on the customer and may have brought
  -- returnables into the store. Reverse both, as if it had never gone out.
  if v_order.status in ('dispatched', 'completed') then
    insert into public.returnable_movements (
      organization_id, returnable_item_id, location_id, customer_id, holding_delta, owed_delta,
      movement_type, source_type, source_id, movement_date, created_by
    )
    select
      v_order.organization_id, e.returnable_item_id, v_order.location_id, v_order.customer_id,
      -coalesce(r.returned, 0), coalesce(r.returned, 0) - e.expected,
      'adjustment', 'order_void', p_order_id, public.org_today(v_order.organization_id), auth.uid()
    from (
      select i.returnable_item_id, sum(i.quantity) as expected
      from public.order_items i
      where i.order_id = p_order_id and i.returnable_item_id is not null
      group by i.returnable_item_id
    ) e
    left join (
      select l.returnable_item_id, sum(l.returned_quantity) as returned
      from public.trip_return_lines l
      where l.order_id = p_order_id
      group by l.returnable_item_id
    ) r on r.returnable_item_id = e.returnable_item_id;

    delete from public.trip_return_lines l where l.order_id = p_order_id;
  end if;

  -- Its serial-numbered units go back into stock, unless the same serial number
  -- has since been stocked again on a later delivery (a trade-in, say).
  select u.serial_no into v_serial
  from public.product_units u
  where u.order_id = p_order_id
    and exists (
      select 1 from public.product_units other
      where other.organization_id = u.organization_id
        and other.serial_no = u.serial_no
        and other.id <> u.id
        and other.status <> 'sold'
    )
  limit 1;
  if v_serial is not null then
    raise exception 'Serial number % has been stocked again since this order, so the order cannot be voided.', v_serial;
  end if;

  update public.product_units u
  set status = 'in_stock', order_id = null, sold_at = null
  where u.order_id = p_order_id;

  -- An order on a trip that has not left simply comes off it.
  if v_order.status = 'assigned' then
    delete from public.dispatch_trip_orders dto where dto.order_id = p_order_id;
  end if;

  update public.orders o
  set status = 'cancelled',
      voided_at = now(),
      voided_by = auth.uid(),
      void_reason = v_reason,
      voided_from_status = v_order.status::text,
      updated_at = now()
  where o.id = p_order_id;

  -- A trip that was only waiting on this order's returns is now finished.
  if v_trip.id is not null and v_trip.status = 'dispatched' and not exists (
    select 1
    from public.dispatch_trip_orders dto
    join public.orders o on o.id = dto.order_id
    where dto.trip_id = v_trip.id and o.status = 'dispatched'
  ) then
    update public.dispatch_trips t
    set status = 'completed', updated_at = now()
    where t.id = v_trip.id;
  end if;

  perform public.write_audit_log(
    v_order.organization_id, 'void_order', 'orders', p_order_id, v_snapshot,
    jsonb_build_object('order_no', v_order.order_no, 'reason', v_reason)
  );
end;
$$;

create or replace function public.void_stock_receipt(p_receipt_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt record;
  v_reason text;
  v_row record;
begin
  select r.id, r.organization_id, r.location_id, r.receipt_no, r.voided_at
  into v_receipt
  from public.stock_receipts r
  where r.id = p_receipt_id
  for update;

  if not found then
    raise exception 'Stock receipt not found.';
  end if;

  perform public.require_org_role(v_receipt.organization_id, array['owner', 'admin']::public.member_role[]);
  v_reason := public.require_reason(p_reason);

  if v_receipt.voided_at is not null then
    raise exception 'This stock receipt has already been voided.';
  end if;

  if exists (
    select 1 from public.product_units u
    where u.receipt_id = p_receipt_id and u.status <> 'in_stock'
  ) then
    raise exception 'This receipt cannot be voided: some of the serial-numbered units it brought in are on an order or sold.';
  end if;

  perform 1
  from public.products p
  where p.id in (select i.product_id from public.stock_receipt_items i where i.receipt_id = p_receipt_id)
  order by p.id
  for update;

  -- Stock that has already been sold cannot be taken back out.
  for v_row in
    select
      p.name,
      i.quantity,
      coalesce((
        select sum(m.qty_in - m.qty_out)
        from public.stock_movements m
        where m.product_id = i.product_id and m.location_id = v_receipt.location_id
      ), 0) as on_hand
    from public.stock_receipt_items i
    join public.products p on p.id = i.product_id
    where i.receipt_id = p_receipt_id
  loop
    if v_row.on_hand < v_row.quantity then
      raise exception 'This receipt cannot be voided: only % of % is left in stock, and it brought in %.',
        trim_scale(v_row.on_hand), v_row.name, trim_scale(v_row.quantity);
    end if;
  end loop;

  delete from public.stock_movements m
  where m.source_type = 'stock_receipt' and m.source_id = p_receipt_id;

  delete from public.product_units u where u.receipt_id = p_receipt_id;

  update public.stock_receipts r
  set voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
  where r.id = p_receipt_id;

  perform public.write_audit_log(
    v_receipt.organization_id, 'void_stock_receipt', 'stock_receipts', p_receipt_id,
    (
      select jsonb_build_object('items', jsonb_agg(jsonb_build_object('product_id', i.product_id, 'quantity', i.quantity)))
      from public.stock_receipt_items i where i.receipt_id = p_receipt_id
    ),
    jsonb_build_object('receipt_no', v_receipt.receipt_no, 'reason', v_reason)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges (replaced functions keep theirs)
-- ---------------------------------------------------------------------------

revoke all on function public.save_product(uuid, uuid, text, text, text, numeric, numeric, numeric, boolean, text, boolean, integer) from public, anon;
revoke all on function public.create_order(uuid, uuid, date, uuid, public.payment_type, text, jsonb, boolean, text, text) from public, anon;
revoke all on function public.update_order(uuid, date, uuid, public.payment_type, text, jsonb, text, text) from public, anon;
revoke all on function public.hand_over_order(uuid) from public, anon;

grant execute on function public.save_product(uuid, uuid, text, text, text, numeric, numeric, numeric, boolean, text, boolean, integer) to authenticated;
grant execute on function public.create_order(uuid, uuid, date, uuid, public.payment_type, text, jsonb, boolean, text, text) to authenticated;
grant execute on function public.update_order(uuid, date, uuid, public.payment_type, text, jsonb, text, text) to authenticated;
grant execute on function public.hand_over_order(uuid) to authenticated;
