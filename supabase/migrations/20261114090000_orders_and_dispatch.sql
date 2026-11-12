-- Iteration 3: customer orders and dispatch trips.
--
-- Flow: an order is recorded (stock is taken off straight away so it cannot be
-- sold twice) -> orders are grouped onto a trip -> the trip is dispatched.
-- An order with no return-due products is complete the moment its trip leaves.
-- An order with return-due products stays "dispatched" until its returns are
-- recorded, which the next iteration adds.

create type public.order_status as enum ('pending', 'assigned', 'dispatched', 'completed', 'cancelled');
create type public.payment_type as enum ('cash', 'transfer', 'credit');
create type public.trip_status as enum ('draft', 'dispatched', 'completed', 'cancelled');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null references public.locations (id),
  order_no text not null,
  order_date date not null,
  customer_id uuid not null references public.customers (id),
  status public.order_status not null default 'pending',
  payment_type public.payment_type not null default 'cash',
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, order_no)
);

create index orders_org_status_idx on public.orders (organization_id, status, order_date desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id),
  quantity numeric(14, 2) not null check (quantity > 0),
  -- Copied from the product when the order is saved, so later price changes
  -- and later changes to the return rule never rewrite an old order.
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  returnable_item_id uuid references public.returnable_items (id),
  line_total numeric(16, 2) generated always as (quantity * unit_price) stored,
  unique (order_id, product_id)
);

create index order_items_order_idx on public.order_items (order_id);

create table public.dispatch_trips (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null references public.locations (id),
  trip_no text not null,
  dispatch_date date not null,
  driver_name text not null check (char_length(btrim(driver_name)) between 2 and 80),
  vehicle text,
  status public.trip_status not null default 'draft',
  note text,
  dispatched_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, trip_no)
);

create index dispatch_trips_org_status_idx
  on public.dispatch_trips (organization_id, status, dispatch_date desc);

create table public.dispatch_trip_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  trip_id uuid not null references public.dispatch_trips (id) on delete cascade,
  -- An order rides on one trip at most.
  order_id uuid not null unique references public.orders (id)
);

create index dispatch_trip_orders_trip_idx on public.dispatch_trip_orders (trip_id);

-- ---------------------------------------------------------------------------
-- Summary views (obey the caller's row level security)
-- ---------------------------------------------------------------------------

create view public.order_summaries
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
  c.name as customer_name,
  c.area as customer_area,
  coalesce(t.total_quantity, 0)::numeric(14, 2) as total_quantity,
  coalesce(t.total_amount, 0)::numeric(16, 2) as total_amount,
  coalesce(t.has_returns, false) as has_returns,
  dt.id as trip_id,
  dt.trip_no,
  o.created_at
from public.orders o
join public.customers c on c.id = o.customer_id
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

create view public.dispatch_trip_summaries
with (security_invoker = true) as
select
  t.id,
  t.organization_id,
  t.location_id,
  t.trip_no,
  t.dispatch_date,
  t.driver_name,
  t.vehicle,
  t.status,
  t.dispatched_at,
  t.created_at,
  count(distinct dto.order_id)::integer as order_count,
  coalesce(sum(i.quantity), 0)::numeric(14, 2) as total_quantity,
  coalesce(sum(i.line_total), 0)::numeric(16, 2) as total_amount,
  coalesce(bool_or(i.returnable_item_id is not null), false) as has_returns
from public.dispatch_trips t
left join public.dispatch_trip_orders dto on dto.trip_id = t.id
left join public.order_items i on i.order_id = dto.order_id
group by t.id;

-- ---------------------------------------------------------------------------
-- Internal helper: validate an order's lines and write them plus their stock
-- movements. Used for both a new order and an edit, where it first hands back
-- the stock the order was already holding.
-- ---------------------------------------------------------------------------

create function public.write_order_items(
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
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one product.';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'A single order can hold up to 200 products.';
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

  -- Lock the products involved, in a fixed order, so two orders saved at the
  -- same moment cannot both take the last of the stock.
  perform 1
  from public.products p
  where p.organization_id = p_organization_id
    and p.id in (
      select item.product_id
      from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric)
    )
  order by p.id
  for update;

  select coalesce(p.name, 'A product') as name
  into v_row
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric)
  left join public.products p
    on p.id = item.product_id and p.organization_id = p_organization_id
  where p.id is null or not p.is_active
  limit 1;

  if found then
    raise exception '% is not an active product of this business.', v_row.name;
  end if;

  select p.name
  into v_row
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric)
  join public.products p on p.id = item.product_id
  where p.selling_price is null
  limit 1;

  if found then
    raise exception 'Ask an owner or admin to set a selling price for % first.', v_row.name;
  end if;

  -- Hand back what this order was holding, then check against what is left.
  delete from public.stock_movements m
  where m.source_type = 'order' and m.source_id = p_order_id;

  for v_row in
    select
      p.name,
      item.quantity as requested,
      coalesce((
        select sum(m.qty_in - m.qty_out)
        from public.stock_movements m
        where m.product_id = item.product_id and m.location_id = p_location_id
      ), 0) as available
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric)
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
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric)
  join public.products p on p.id = item.product_id;

  insert into public.stock_movements (
    organization_id, location_id, product_id, movement_type, qty_out,
    source_type, source_id, movement_date, created_by
  )
  select
    p_organization_id, p_location_id, item.product_id, 'sale', item.quantity,
    'order', p_order_id, p_order_date, auth.uid()
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric);
end;
$$;

-- Shared checks for the header fields of an order.
create function public.assert_order_header(
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

  if not exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.organization_id = p_organization_id and c.is_active
  ) then
    raise exception 'Choose one of your active customers.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------

create function public.create_order(
  p_organization_id uuid,
  p_location_id uuid,
  p_order_date date,
  p_customer_id uuid,
  p_payment_type public.payment_type,
  p_note text,
  p_items jsonb
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
    organization_id, location_id, order_no, order_date, customer_id, payment_type, note, created_by
  )
  values (
    p_organization_id, p_location_id, v_order_no, p_order_date, p_customer_id,
    coalesce(p_payment_type, 'cash'),
    nullif(left(btrim(coalesce(p_note, '')), 500), ''),
    auth.uid()
  )
  returning orders.id into v_order_id;

  perform public.write_order_items(p_organization_id, v_order_id, p_location_id, p_order_date, p_items);

  perform public.write_audit_log(
    p_organization_id, 'create_order', 'orders', v_order_id, null,
    jsonb_build_object(
      'order_no', v_order_no, 'order_date', p_order_date, 'customer_id', p_customer_id,
      'payment_type', coalesce(p_payment_type, 'cash'), 'items', p_items
    )
  );

  return query select v_order_id, v_order_no;
end;
$$;

-- An order can be changed only while it is still waiting for a trip.
create function public.update_order(
  p_order_id uuid,
  p_order_date date,
  p_customer_id uuid,
  p_payment_type public.payment_type,
  p_note text,
  p_items jsonb
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

-- Cancelling puts the stock back. The order itself is kept for the record.
create function public.cancel_order(p_order_id uuid)
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

-- ---------------------------------------------------------------------------
-- Dispatch trips
-- ---------------------------------------------------------------------------

create function public.create_dispatch_trip(
  p_organization_id uuid,
  p_location_id uuid,
  p_dispatch_date date,
  p_driver_name text,
  p_vehicle text,
  p_note text,
  p_order_ids uuid[]
)
returns table (id uuid, trip_no text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver text := btrim(coalesce(p_driver_name, ''));
  v_order_ids uuid[];
  v_ready integer;
  v_trip_id uuid;
  v_trip_no text;
begin
  perform public.require_org_role(
    p_organization_id, array['owner', 'admin', 'staff']::public.member_role[]
  );

  if p_dispatch_date is null then
    raise exception 'Enter the dispatch date.';
  end if;
  if p_dispatch_date > public.org_today(p_organization_id) then
    raise exception 'The dispatch date cannot be in the future.';
  end if;
  if char_length(v_driver) < 2 or char_length(v_driver) > 80 then
    raise exception 'Enter the driver''s name.';
  end if;

  if not exists (
    select 1 from public.locations l
    where l.id = p_location_id and l.organization_id = p_organization_id and l.is_active
  ) then
    raise exception 'Choose one of your locations.';
  end if;

  select array_agg(distinct order_id) into v_order_ids
  from unnest(coalesce(p_order_ids, '{}'::uuid[])) as order_id
  where order_id is not null;

  if v_order_ids is null then
    raise exception 'Choose at least one order to put on the trip.';
  end if;

  -- Lock the chosen orders so none can be edited, cancelled or put on another
  -- trip while this one is being built.
  select count(*) into v_ready
  from (
    select 1
    from public.orders o
    where o.id = any (v_order_ids)
      and o.organization_id = p_organization_id
      and o.location_id = p_location_id
      and o.status = 'pending'
    for update
  ) locked;

  if v_ready <> cardinality(v_order_ids) then
    raise exception 'One of the chosen orders is no longer waiting for dispatch at this location. Refresh and try again.';
  end if;

  v_trip_no := public.next_document_number(p_organization_id, 'dispatch_trip', 'TRP', p_dispatch_date);

  insert into public.dispatch_trips (
    organization_id, location_id, trip_no, dispatch_date, driver_name, vehicle, note, created_by
  )
  values (
    p_organization_id, p_location_id, v_trip_no, p_dispatch_date, v_driver,
    nullif(left(btrim(coalesce(p_vehicle, '')), 80), ''),
    nullif(left(btrim(coalesce(p_note, '')), 500), ''),
    auth.uid()
  )
  returning dispatch_trips.id into v_trip_id;

  insert into public.dispatch_trip_orders (organization_id, trip_id, order_id)
  select p_organization_id, v_trip_id, order_id
  from unnest(v_order_ids) as order_id;

  update public.orders o
  set status = 'assigned', updated_at = now()
  where o.id = any (v_order_ids);

  perform public.write_audit_log(
    p_organization_id, 'create_dispatch_trip', 'dispatch_trips', v_trip_id, null,
    jsonb_build_object(
      'trip_no', v_trip_no, 'dispatch_date', p_dispatch_date, 'driver_name', v_driver,
      'order_ids', to_jsonb(v_order_ids)
    )
  );

  return query select v_trip_id, v_trip_no;
end;
$$;

create function public.dispatch_trip(p_trip_id uuid)
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
  select t.id, t.organization_id, t.status, t.trip_no
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

  -- Nothing to bring back: the order is finished once it is on the road.
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

-- Cancelling a trip that has not left sends its orders back to the waiting list.
create function public.cancel_dispatch_trip(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip record;
  v_order_ids uuid[];
begin
  select t.id, t.organization_id, t.status, t.trip_no
  into v_trip
  from public.dispatch_trips t
  where t.id = p_trip_id
  for update;

  if not found then
    raise exception 'Trip not found.';
  end if;

  perform public.require_org_role(
    v_trip.organization_id, array['owner', 'admin']::public.member_role[]
  );

  if v_trip.status <> 'draft' then
    raise exception 'Only a trip that has not been dispatched can be cancelled.';
  end if;

  select coalesce(array_agg(dto.order_id), '{}'::uuid[]) into v_order_ids
  from public.dispatch_trip_orders dto
  where dto.trip_id = p_trip_id;

  update public.orders o
  set status = 'pending', updated_at = now()
  where o.id = any (v_order_ids);

  delete from public.dispatch_trip_orders dto where dto.trip_id = p_trip_id;

  update public.dispatch_trips t
  set status = 'cancelled', updated_at = now()
  where t.id = p_trip_id;

  perform public.write_audit_log(
    v_trip.organization_id, 'cancel_dispatch_trip', 'dispatch_trips', p_trip_id,
    jsonb_build_object('status', 'draft', 'order_ids', to_jsonb(v_order_ids)),
    jsonb_build_object('status', 'cancelled', 'trip_no', v_trip.trip_no)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.dispatch_trips enable row level security;
alter table public.dispatch_trip_orders enable row level security;

revoke all on
  public.orders,
  public.order_items,
  public.dispatch_trips,
  public.dispatch_trip_orders,
  public.order_summaries,
  public.dispatch_trip_summaries
from anon, authenticated;

grant select on
  public.orders,
  public.order_items,
  public.dispatch_trips,
  public.dispatch_trip_orders,
  public.order_summaries,
  public.dispatch_trip_summaries
to authenticated;

create policy "members read orders"
on public.orders for select to authenticated
using (public.is_org_member(organization_id));

create policy "members read order items"
on public.order_items for select to authenticated
using (public.is_org_member(organization_id));

create policy "members read dispatch trips"
on public.dispatch_trips for select to authenticated
using (public.is_org_member(organization_id));

create policy "members read dispatch trip orders"
on public.dispatch_trip_orders for select to authenticated
using (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke all on function public.write_order_items(uuid, uuid, uuid, date, jsonb) from public, anon, authenticated;
revoke all on function public.assert_order_header(uuid, uuid, date, uuid) from public, anon, authenticated;

revoke all on function public.create_order(uuid, uuid, date, uuid, public.payment_type, text, jsonb) from public, anon;
revoke all on function public.update_order(uuid, date, uuid, public.payment_type, text, jsonb) from public, anon;
revoke all on function public.cancel_order(uuid) from public, anon;
revoke all on function public.create_dispatch_trip(uuid, uuid, date, text, text, text, uuid[]) from public, anon;
revoke all on function public.dispatch_trip(uuid) from public, anon;
revoke all on function public.cancel_dispatch_trip(uuid) from public, anon;

grant execute on function public.create_order(uuid, uuid, date, uuid, public.payment_type, text, jsonb) to authenticated;
grant execute on function public.update_order(uuid, date, uuid, public.payment_type, text, jsonb) to authenticated;
grant execute on function public.cancel_order(uuid) to authenticated;
grant execute on function public.create_dispatch_trip(uuid, uuid, date, text, text, text, uuid[]) to authenticated;
grant execute on function public.dispatch_trip(uuid) to authenticated;
grant execute on function public.cancel_dispatch_trip(uuid) to authenticated;
