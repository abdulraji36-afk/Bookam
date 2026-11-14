-- Iteration 13: one simple customer form, and changing a delivery after
-- offloading.
--
-- 1. Customers no longer have a type or an RGB/PET/both setting. Every
--    customer can buy anything. The rule that a customer has only one order
--    with RGB crates waiting for dispatch stays.
-- 2. As in Bilikis, an owner or admin can correct a delivery after the
--    fact, even days later: its date, supplier, reference and note, and its
--    products (add, remove, change quantities and costs). A delivery is
--    entered as on the waybill; after offloading, breakages and damaged goods
--    handed back to the supplier come off it this way. Its stock lines are
--    rewritten at the delivery's date, so stock on hand and every daily
--    report recalculate from them. Nothing may leave stock below zero, and
--    each change keeps the old figures and the reason.

-- ---------------------------------------------------------------------------
-- 1. Customers: back to one form
-- ---------------------------------------------------------------------------

create or replace function public.drinks_order_line_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_waiting text;
begin
  if new.returnable_item_id is null then
    return new;
  end if;

  select o.id, o.customer_id, c.name as customer_name
  into v_order
  from public.orders o
  join public.organizations org on org.id = o.organization_id and org.sells_drinks
  left join public.customers c on c.id = o.customer_id
  where o.id = new.order_id;

  if not found or v_order.customer_id is null then
    return new;
  end if;

  select o.order_no into v_waiting
  from public.orders o
  where o.customer_id = v_order.customer_id
    and o.id <> new.order_id
    and o.status = 'pending'
    and exists (
      select 1 from public.order_items i
      where i.order_id = o.id and i.returnable_item_id is not null
    )
  order by o.created_at
  limit 1;
  if v_waiting is not null then
    raise exception '% already has order % with RGB crates waiting for dispatch. Open and edit that order instead of adding another.',
      v_order.customer_name, v_waiting;
  end if;

  return new;
end;
$$;

drop function public.save_customer(uuid, uuid, text, text, text, text, text, text);

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

alter table public.customers
  drop column customer_type,
  drop column buys;

-- ---------------------------------------------------------------------------
-- 2. Correcting a delivery
-- ---------------------------------------------------------------------------

-- One row per product whose quantity a correction changed (0 = added or removed).
create table public.stock_receipt_corrections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  receipt_id uuid not null references public.stock_receipts (id) on delete cascade,
  product_id uuid not null references public.products (id),
  old_quantity numeric(14, 2) not null,
  new_quantity numeric(14, 2) not null,
  reason text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index stock_receipt_corrections_receipt_idx on public.stock_receipt_corrections (receipt_id, created_at);

alter table public.stock_receipt_corrections enable row level security;
revoke all on public.stock_receipt_corrections from anon, authenticated;
grant select on public.stock_receipt_corrections to authenticated;

create policy "members read delivery corrections"
on public.stock_receipt_corrections for select to authenticated
using (public.is_org_member(organization_id));

create function public.correct_stock_receipt(
  p_receipt_id uuid,
  p_received_date date,
  p_supplier_name text,
  p_reference text,
  p_note text,
  p_items jsonb,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt record;
  v_reason text;
  v_row record;
  v_changed integer;
begin
  select r.id, r.organization_id, r.location_id, r.receipt_no, r.received_date, r.supplier_name,
         r.reference, r.note, r.voided_at, o.sells_drinks
  into v_receipt
  from public.stock_receipts r
  join public.organizations o on o.id = r.organization_id
  where r.id = p_receipt_id
  for update of r;

  if not found then
    raise exception 'Delivery not found.';
  end if;

  perform public.require_org_role(v_receipt.organization_id, array['owner', 'admin']::public.member_role[]);
  v_reason := public.require_reason(p_reason);

  if v_receipt.voided_at is not null then
    raise exception 'This delivery was voided, so it cannot be changed.';
  end if;
  if exists (select 1 from public.product_units u where u.receipt_id = p_receipt_id) then
    raise exception 'This delivery has serial numbers. Void it and enter it again instead.';
  end if;

  if p_received_date is null then
    raise exception 'Enter the date the stock arrived.';
  end if;
  if p_received_date > public.org_today(v_receipt.organization_id) then
    raise exception 'The date cannot be in the future.';
  end if;
  if v_receipt.sells_drinks and nullif(btrim(coalesce(p_reference, '')), '') is null then
    raise exception 'Enter the supplier''s delivery reference, such as the NBC delivery ref.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A delivery needs at least one product. To cancel it, void it instead.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric, unit_cost numeric)
    where item.product_id is null or item.quantity is null or item.quantity <= 0 or item.quantity > 9999999
      or item.unit_cost < 0
  ) then
    raise exception 'Every product needs a quantity greater than zero, and a cost of zero or more.';
  end if;
  if exists (
    select item.product_id
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric, unit_cost numeric)
    group by item.product_id having count(*) > 1
  ) then
    raise exception 'A product is listed more than once. Combine it into one line.';
  end if;

  select p.name into v_row
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric, unit_cost numeric)
  left join public.products p on p.id = item.product_id and p.organization_id = v_receipt.organization_id
  where p.id is null or p.tracks_serials
  limit 1;
  if found then
    raise exception 'Choose products from your list. Serial-numbered products are received with their serial numbers.';
  end if;

  -- Lock the products involved so stock cannot move underneath the check.
  perform 1 from public.products p
  where p.id in (
    select i.product_id from public.stock_receipt_items i where i.receipt_id = p_receipt_id
    union
    select item.product_id from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric, unit_cost numeric)
  )
  for update;

  -- As in Bilikis: what stock would be after the change, and never below zero.
  for v_row in
    with old_items as (
      select i.product_id, i.quantity from public.stock_receipt_items i where i.receipt_id = p_receipt_id
    ),
    new_items as (
      select item.product_id, item.quantity
      from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric, unit_cost numeric)
    ),
    changed as (
      select product_id from old_items union select product_id from new_items
    )
    select p.name,
           coalesce((select sum(m.qty_in - m.qty_out) from public.stock_movements m
                     where m.product_id = c.product_id and m.location_id = v_receipt.location_id), 0)
           - coalesce(o.quantity, 0) + coalesce(n.quantity, 0) as projected
    from changed c
    join public.products p on p.id = c.product_id
    left join old_items o on o.product_id = c.product_id
    left join new_items n on n.product_id = c.product_id
  loop
    if v_row.projected < 0 then
      raise exception 'This change would leave % below zero in stock (%). Some of it has already gone out.',
        v_row.name, trim_scale(v_row.projected);
    end if;
  end loop;

  -- The history: one row for each product whose quantity changes.
  insert into public.stock_receipt_corrections (
    organization_id, receipt_id, product_id, old_quantity, new_quantity, reason, created_by
  )
  select v_receipt.organization_id, p_receipt_id, coalesce(o.product_id, n.product_id),
         coalesce(o.quantity, 0), coalesce(n.quantity, 0), v_reason, auth.uid()
  from (select i.product_id, i.quantity from public.stock_receipt_items i where i.receipt_id = p_receipt_id) o
  full join (
    select item.product_id, item.quantity
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric, unit_cost numeric)
  ) n on n.product_id = o.product_id
  where coalesce(o.quantity, 0) <> coalesce(n.quantity, 0);
  get diagnostics v_changed = row_count;

  if v_changed = 0
    and p_received_date = v_receipt.received_date
    and coalesce(nullif(btrim(coalesce(p_supplier_name, '')), ''), '') = coalesce(v_receipt.supplier_name, '')
    and coalesce(nullif(btrim(coalesce(p_reference, '')), ''), '') = coalesce(v_receipt.reference, '')
    and coalesce(nullif(btrim(coalesce(p_note, '')), ''), '') = coalesce(v_receipt.note, '')
    and not exists (
      select 1
      from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric, unit_cost numeric)
      join public.stock_receipt_items i on i.receipt_id = p_receipt_id and i.product_id = item.product_id
      left join public.stock_receipt_item_costs c on c.receipt_item_id = i.id
      where item.unit_cost is not null and item.unit_cost is distinct from c.unit_cost
    ) then
    raise exception 'Nothing has changed.';
  end if;

  update public.stock_receipts r
  set received_date = p_received_date,
      supplier_name = nullif(left(btrim(coalesce(p_supplier_name, '')), 80), ''),
      reference = nullif(left(btrim(coalesce(p_reference, '')), 80), ''),
      note = nullif(left(btrim(coalesce(p_note, '')), 500), '')
  where r.id = p_receipt_id;

  -- Rewrite the lines and their stock movements, dated on the delivery date.
  delete from public.stock_movements m where m.source_type = 'stock_receipt' and m.source_id = p_receipt_id;
  delete from public.stock_receipt_items i where i.receipt_id = p_receipt_id;

  insert into public.stock_receipt_items (organization_id, receipt_id, product_id, quantity)
  select v_receipt.organization_id, p_receipt_id, item.product_id, item.quantity
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric, unit_cost numeric);

  -- A cost given on the line replaces the one copied from the product.
  insert into public.stock_receipt_item_costs as c (receipt_item_id, organization_id, unit_cost, updated_by)
  select i.id, i.organization_id, item.unit_cost, auth.uid()
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric, unit_cost numeric)
  join public.stock_receipt_items i on i.receipt_id = p_receipt_id and i.product_id = item.product_id
  where item.unit_cost is not null
  on conflict (receipt_item_id)
  do update set unit_cost = excluded.unit_cost, updated_by = excluded.updated_by, updated_at = now();

  insert into public.stock_movements (
    organization_id, location_id, product_id, movement_type, qty_in,
    source_type, source_id, movement_date, created_by
  )
  select v_receipt.organization_id, v_receipt.location_id, item.product_id, 'stock_in', item.quantity,
         'stock_receipt', p_receipt_id, p_received_date, auth.uid()
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric, unit_cost numeric);

  perform public.write_audit_log(
    v_receipt.organization_id, 'correct_stock_receipt', 'stock_receipts', p_receipt_id,
    jsonb_build_object(
      'received_date', v_receipt.received_date, 'supplier', v_receipt.supplier_name,
      'reference', v_receipt.reference
    ),
    jsonb_build_object(
      'receipt_no', v_receipt.receipt_no, 'received_date', p_received_date, 'supplier', p_supplier_name,
      'reference', p_reference, 'items', p_items, 'reason', v_reason
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke all on function public.drinks_order_line_rules() from public, anon, authenticated;
revoke all on function public.save_customer(uuid, uuid, text, text, text, text) from public, anon;
revoke all on function public.correct_stock_receipt(uuid, date, text, text, text, jsonb, text) from public, anon;

grant execute on function public.save_customer(uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.correct_stock_receipt(uuid, date, text, text, text, jsonb, text) to authenticated;
