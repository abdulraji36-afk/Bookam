-- Iteration 4: tracking what comes back (crates, cylinders, pallets...).
--
-- For every returnable item two running counts are kept, both as sums over
-- one ledger (returnable_movements), never as numbers that get edited:
--   * holding: how many the business has in store, per location
--   * owed:    how many each customer still has to bring back
--
--   event                          holding   customer owes
--   order dispatched                  .          + n
--   returned with the trip           + n         - n
--   supplier takes them away         - n          .
--   adjustment: add                  + n     (- n if a customer is named)
--   adjustment: subtract             - n     (+ n if a customer is named)
--   customer's debt from before       .          + n

create type public.returnable_movement_type as enum (
  'dispatch', 'trip_return', 'supplier_exchange', 'adjustment', 'opening_debt'
);

create type public.returnable_adjustment_reason as enum (
  'customer_return',   -- add: a customer brought some back outside a trip
  'purchase',          -- add: bought new ones
  'opening_count',     -- add: what was in store when the business started here
  'correction',        -- add or subtract: the count was wrong
  'damaged_or_lost',   -- subtract
  'given_to_customer'  -- subtract: handed back to a customer
);

create table public.returnable_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  returnable_item_id uuid not null references public.returnable_items (id),
  location_id uuid references public.locations (id),
  customer_id uuid references public.customers (id),
  holding_delta numeric(14, 2) not null default 0,
  owed_delta numeric(14, 2) not null default 0,
  movement_type public.returnable_movement_type not null,
  source_type text not null,
  source_id uuid not null,
  movement_date date not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint returnable_movements_changes_something check (holding_delta <> 0 or owed_delta <> 0),
  constraint returnable_movements_holding_has_location check (holding_delta = 0 or location_id is not null),
  constraint returnable_movements_owed_has_customer check (owed_delta = 0 or customer_id is not null)
);

create index returnable_movements_item_idx
  on public.returnable_movements (organization_id, returnable_item_id, location_id);
create index returnable_movements_customer_idx
  on public.returnable_movements (organization_id, customer_id) where customer_id is not null;
create index returnable_movements_recent_idx
  on public.returnable_movements (organization_id, created_at desc);

-- What each order on a returned trip was expected to bring back, and what it did.
create table public.trip_return_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  trip_id uuid not null references public.dispatch_trips (id) on delete cascade,
  order_id uuid not null references public.orders (id),
  returnable_item_id uuid not null references public.returnable_items (id),
  expected_quantity numeric(14, 2) not null check (expected_quantity > 0),
  returned_quantity numeric(14, 2) not null check (returned_quantity >= 0),
  unique (order_id, returnable_item_id)
);

create index trip_return_lines_trip_idx on public.trip_return_lines (trip_id);

alter table public.dispatch_trips
  add column returned_date date,
  add column returns_recorded_at timestamptz;

create table public.supplier_exchanges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null references public.locations (id),
  exchange_no text not null,
  exchange_date date not null,
  returnable_item_id uuid not null references public.returnable_items (id),
  quantity_taken numeric(14, 2) not null check (quantity_taken > 0),
  supplier_name text,
  reference text,
  received_by text,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, exchange_no)
);

create table public.returnable_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null references public.locations (id),
  adjustment_date date not null,
  returnable_item_id uuid not null references public.returnable_items (id),
  -- Positive adds to what is in store, negative subtracts.
  quantity_delta numeric(14, 2) not null check (quantity_delta <> 0),
  reason public.returnable_adjustment_reason not null,
  customer_id uuid references public.customers (id),
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Summary views (obey the caller's row level security)
-- ---------------------------------------------------------------------------

create view public.returnable_holdings
with (security_invoker = true) as
select
  r.organization_id,
  r.id as returnable_item_id,
  l.id as location_id,
  coalesce(sum(m.holding_delta), 0)::numeric(14, 2) as holding
from public.returnable_items r
join public.locations l on l.organization_id = r.organization_id
left join public.returnable_movements m
  on m.returnable_item_id = r.id and m.location_id = l.id
group by r.organization_id, r.id, l.id;

-- Who owes what. A negative figure means the business is holding some for the
-- customer (they brought back more than they owed).
create view public.customer_returnable_balances
with (security_invoker = true) as
select
  m.organization_id,
  m.customer_id,
  c.name as customer_name,
  c.area as customer_area,
  m.returnable_item_id,
  r.name as returnable_name,
  sum(m.owed_delta)::numeric(14, 2) as owed
from public.returnable_movements m
join public.customers c on c.id = m.customer_id
join public.returnable_items r on r.id = m.returnable_item_id
where m.customer_id is not null
group by m.organization_id, m.customer_id, c.name, c.area, m.returnable_item_id, r.name
having sum(m.owed_delta) <> 0;

-- Per returnable item: how many are in store, how many customers owe in total,
-- and how many the business is holding for customers who are in credit.
create view public.returnable_totals
with (security_invoker = true) as
select
  r.organization_id,
  r.id as returnable_item_id,
  r.name,
  coalesce((
    select sum(m.holding_delta)
    from public.returnable_movements m
    where m.returnable_item_id = r.id
  ), 0)::numeric(14, 2) as holding,
  coalesce((
    select sum(b.owed)
    from public.customer_returnable_balances b
    where b.returnable_item_id = r.id and b.owed > 0
  ), 0)::numeric(14, 2) as owed,
  coalesce((
    select -sum(b.owed)
    from public.customer_returnable_balances b
    where b.returnable_item_id = r.id and b.owed < 0
  ), 0)::numeric(14, 2) as credit
from public.returnable_items r;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.returnable_holding_at(p_returnable_item_id uuid, p_location_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(m.holding_delta), 0)
  from public.returnable_movements m
  where m.returnable_item_id = p_returnable_item_id
    and m.location_id = p_location_id;
$$;

-- Shared checks for the three "something happened at a location" forms.
create function public.assert_returnable_event(
  p_organization_id uuid,
  p_location_id uuid,
  p_returnable_item_id uuid,
  p_event_date date,
  p_quantity numeric
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if p_event_date is null then
    raise exception 'Enter the date.';
  end if;
  if p_event_date > public.org_today(p_organization_id) then
    raise exception 'The date cannot be in the future.';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Enter a quantity greater than zero.';
  end if;

  if not exists (
    select 1 from public.locations l
    where l.id = p_location_id and l.organization_id = p_organization_id and l.is_active
  ) then
    raise exception 'Choose one of your locations.';
  end if;

  select r.name into v_name
  from public.returnable_items r
  where r.id = p_returnable_item_id and r.organization_id = p_organization_id;

  if v_name is null then
    raise exception 'Choose one of your returnable items.';
  end if;

  -- Serialises changes to this item's count so two people cannot both take the last ones.
  perform 1 from public.returnable_items r where r.id = p_returnable_item_id for update;

  return v_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dispatch now also records what each customer owes back
-- ---------------------------------------------------------------------------

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

-- Orders dispatched before this migration owe their returnables too.
insert into public.returnable_movements (
  organization_id, returnable_item_id, customer_id, owed_delta,
  movement_type, source_type, source_id, movement_date, created_by
)
select
  o.organization_id, i.returnable_item_id, o.customer_id, sum(i.quantity),
  'dispatch', 'order', o.id, t.dispatch_date, t.created_by
from public.order_items i
join public.orders o on o.id = i.order_id
join public.dispatch_trip_orders dto on dto.order_id = o.id
join public.dispatch_trips t on t.id = dto.trip_id
where o.status = 'dispatched'
  and i.returnable_item_id is not null
group by o.organization_id, i.returnable_item_id, o.customer_id, o.id, t.dispatch_date, t.created_by;

-- ---------------------------------------------------------------------------
-- Recording what came back with a trip
-- ---------------------------------------------------------------------------

-- p_returns: [{ "order_id": ..., "returnable_item_id": ..., "quantity": n }, ...]
-- with one entry for every order and returnable item the trip was owed.
-- Whatever is not returned simply stays on the customer's balance.
create function public.record_trip_returns(
  p_trip_id uuid,
  p_returned_date date,
  p_returns jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip record;
  v_expected jsonb;
  v_expected_count integer;
  v_matched_count integer;
  v_given_count integer;
begin
  select t.id, t.organization_id, t.location_id, t.status, t.trip_no, t.dispatch_date
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

  if v_trip.status <> 'dispatched' then
    raise exception 'Returns can only be recorded for a trip that is out with returns due.';
  end if;

  if p_returned_date is null then
    raise exception 'Enter the date the trip came back.';
  end if;
  if p_returned_date > public.org_today(v_trip.organization_id) then
    raise exception 'The return date cannot be in the future.';
  end if;
  if p_returned_date < v_trip.dispatch_date then
    raise exception 'The return date cannot be before the trip was dispatched.';
  end if;

  if p_returns is null or jsonb_typeof(p_returns) <> 'array' then
    raise exception 'Enter what each customer returned.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_returns) as r(order_id uuid, returnable_item_id uuid, quantity numeric)
    where r.order_id is null or r.returnable_item_id is null or r.quantity is null or r.quantity < 0
  ) then
    raise exception 'Enter a number, zero or more, for every customer.';
  end if;

  select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
  into v_expected
  from (
    select
      o.id as order_id,
      o.customer_id,
      i.returnable_item_id,
      sum(i.quantity) as expected_quantity
    from public.dispatch_trip_orders dto
    join public.orders o on o.id = dto.order_id
    join public.order_items i on i.order_id = o.id
    where dto.trip_id = p_trip_id
      and i.returnable_item_id is not null
    group by o.id, o.customer_id, i.returnable_item_id
  ) e;

  v_expected_count := jsonb_array_length(v_expected);

  select count(*) into v_given_count
  from jsonb_to_recordset(p_returns) as r(order_id uuid, returnable_item_id uuid, quantity numeric);

  -- Counting distinct pairs means a duplicated entry cannot stand in for a missing one.
  select count(distinct (e.order_id, e.returnable_item_id)) into v_matched_count
  from jsonb_to_recordset(v_expected)
    as e(order_id uuid, customer_id uuid, returnable_item_id uuid, expected_quantity numeric)
  join jsonb_to_recordset(p_returns) as r(order_id uuid, returnable_item_id uuid, quantity numeric)
    on r.order_id = e.order_id and r.returnable_item_id = e.returnable_item_id;

  if v_matched_count <> v_expected_count or v_given_count <> v_expected_count then
    raise exception 'Enter what every customer on this trip returned, once each.';
  end if;

  insert into public.trip_return_lines (
    organization_id, trip_id, order_id, returnable_item_id, expected_quantity, returned_quantity
  )
  select v_trip.organization_id, p_trip_id, e.order_id, e.returnable_item_id, e.expected_quantity, r.quantity
  from jsonb_to_recordset(v_expected)
    as e(order_id uuid, customer_id uuid, returnable_item_id uuid, expected_quantity numeric)
  join jsonb_to_recordset(p_returns) as r(order_id uuid, returnable_item_id uuid, quantity numeric)
    on r.order_id = e.order_id and r.returnable_item_id = e.returnable_item_id;

  insert into public.returnable_movements (
    organization_id, returnable_item_id, location_id, customer_id, holding_delta, owed_delta,
    movement_type, source_type, source_id, movement_date, created_by
  )
  select
    v_trip.organization_id, e.returnable_item_id, v_trip.location_id, e.customer_id,
    r.quantity, -r.quantity,
    'trip_return', 'dispatch_trip', p_trip_id, p_returned_date, auth.uid()
  from jsonb_to_recordset(v_expected)
    as e(order_id uuid, customer_id uuid, returnable_item_id uuid, expected_quantity numeric)
  join jsonb_to_recordset(p_returns) as r(order_id uuid, returnable_item_id uuid, quantity numeric)
    on r.order_id = e.order_id and r.returnable_item_id = e.returnable_item_id
  where r.quantity > 0;

  update public.orders o
  set status = 'completed', updated_at = now()
  where o.id in (select dto.order_id from public.dispatch_trip_orders dto where dto.trip_id = p_trip_id)
    and o.status = 'dispatched';

  update public.dispatch_trips t
  set status = 'completed',
      returned_date = p_returned_date,
      returns_recorded_at = now(),
      updated_at = now()
  where t.id = p_trip_id;

  perform public.write_audit_log(
    v_trip.organization_id, 'record_trip_returns', 'dispatch_trips', p_trip_id, null,
    jsonb_build_object('trip_no', v_trip.trip_no, 'returned_date', p_returned_date, 'returns', p_returns)
  );

end;
$$;

-- ---------------------------------------------------------------------------
-- Supplier exchange: the supplier takes returnables away
-- ---------------------------------------------------------------------------

create function public.record_supplier_exchange(
  p_organization_id uuid,
  p_location_id uuid,
  p_exchange_date date,
  p_returnable_item_id uuid,
  p_quantity numeric,
  p_supplier_name text,
  p_reference text,
  p_received_by text,
  p_note text
)
returns table (id uuid, exchange_no text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_holding numeric;
  v_exchange_id uuid;
  v_exchange_no text;
begin
  perform public.require_org_role(
    p_organization_id, array['owner', 'admin', 'staff']::public.member_role[]
  );
  v_name := public.assert_returnable_event(
    p_organization_id, p_location_id, p_returnable_item_id, p_exchange_date, p_quantity
  );

  v_holding := public.returnable_holding_at(p_returnable_item_id, p_location_id);
  if v_holding < p_quantity then
    raise exception 'You only have % % in store here, so % cannot be taken. If the count is wrong, ask an owner or admin to adjust it.',
      trim_scale(v_holding), v_name, trim_scale(p_quantity);
  end if;

  v_exchange_no := public.next_document_number(p_organization_id, 'supplier_exchange', 'EXC', p_exchange_date);

  insert into public.supplier_exchanges (
    organization_id, location_id, exchange_no, exchange_date, returnable_item_id, quantity_taken,
    supplier_name, reference, received_by, note, created_by
  )
  values (
    p_organization_id, p_location_id, v_exchange_no, p_exchange_date, p_returnable_item_id, p_quantity,
    nullif(left(btrim(coalesce(p_supplier_name, '')), 80), ''),
    nullif(left(btrim(coalesce(p_reference, '')), 80), ''),
    nullif(left(btrim(coalesce(p_received_by, '')), 80), ''),
    nullif(left(btrim(coalesce(p_note, '')), 500), ''),
    auth.uid()
  )
  returning supplier_exchanges.id into v_exchange_id;

  insert into public.returnable_movements (
    organization_id, returnable_item_id, location_id, holding_delta,
    movement_type, source_type, source_id, movement_date, created_by
  )
  values (
    p_organization_id, p_returnable_item_id, p_location_id, -p_quantity,
    'supplier_exchange', 'supplier_exchange', v_exchange_id, p_exchange_date, auth.uid()
  );

  perform public.write_audit_log(
    p_organization_id, 'record_supplier_exchange', 'supplier_exchanges', v_exchange_id, null,
    jsonb_build_object('exchange_no', v_exchange_no, 'returnable', v_name, 'quantity_taken', p_quantity)
  );

  return query select v_exchange_id, v_exchange_no;
end;
$$;

-- ---------------------------------------------------------------------------
-- Adjustments: an owner or admin adds to or subtracts from the count
-- ---------------------------------------------------------------------------

create function public.record_returnable_adjustment(
  p_organization_id uuid,
  p_location_id uuid,
  p_adjustment_date date,
  p_returnable_item_id uuid,
  p_direction text,
  p_quantity numeric,
  p_reason public.returnable_adjustment_reason,
  p_customer_id uuid,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_delta numeric;
  v_holding numeric;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
  v_adjustment_id uuid;
begin
  perform public.require_org_role(p_organization_id, array['owner', 'admin']::public.member_role[]);
  v_name := public.assert_returnable_event(
    p_organization_id, p_location_id, p_returnable_item_id, p_adjustment_date, p_quantity
  );

  if p_direction not in ('add', 'subtract') or p_direction is null then
    raise exception 'Choose whether to add or subtract.';
  end if;
  if p_reason is null then
    raise exception 'Choose a reason.';
  end if;
  if p_direction = 'add' and p_reason not in ('customer_return', 'purchase', 'opening_count', 'correction') then
    raise exception 'That reason does not go with adding.';
  end if;
  if p_direction = 'subtract' and p_reason not in ('damaged_or_lost', 'given_to_customer', 'correction') then
    raise exception 'That reason does not go with subtracting.';
  end if;

  if p_reason in ('customer_return', 'given_to_customer') and p_customer_id is null then
    raise exception 'Choose the customer.';
  end if;
  if p_reason not in ('customer_return', 'given_to_customer') and p_customer_id is not null then
    raise exception 'A customer can only be named when they brought some back or were given some.';
  end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.organization_id = p_organization_id
  ) then
    raise exception 'Choose one of your customers.';
  end if;
  if p_reason = 'correction' and v_note is null then
    raise exception 'Add a note saying why the count is being corrected.';
  end if;

  v_delta := case when p_direction = 'add' then p_quantity else -p_quantity end;

  if v_delta < 0 then
    v_holding := public.returnable_holding_at(p_returnable_item_id, p_location_id);
    if v_holding < p_quantity then
      raise exception 'You only have % % in store here, so % cannot be subtracted.',
        trim_scale(v_holding), v_name, trim_scale(p_quantity);
    end if;
  end if;

  insert into public.returnable_adjustments (
    organization_id, location_id, adjustment_date, returnable_item_id, quantity_delta,
    reason, customer_id, note, created_by
  )
  values (
    p_organization_id, p_location_id, p_adjustment_date, p_returnable_item_id, v_delta,
    p_reason, p_customer_id, v_note, auth.uid()
  )
  returning returnable_adjustments.id into v_adjustment_id;

  -- With a customer named, what comes in comes off their balance and vice versa.
  insert into public.returnable_movements (
    organization_id, returnable_item_id, location_id, customer_id, holding_delta, owed_delta,
    movement_type, source_type, source_id, movement_date, created_by
  )
  values (
    p_organization_id, p_returnable_item_id, p_location_id, p_customer_id,
    v_delta, case when p_customer_id is null then 0 else -v_delta end,
    'adjustment', 'returnable_adjustment', v_adjustment_id, p_adjustment_date, auth.uid()
  );

  perform public.write_audit_log(
    p_organization_id, 'record_returnable_adjustment', 'returnable_adjustments', v_adjustment_id, null,
    jsonb_build_object(
      'returnable', v_name, 'quantity_delta', v_delta, 'reason', p_reason,
      'customer_id', p_customer_id, 'note', v_note
    )
  );

  return v_adjustment_id;
end;
$$;

-- What a customer already owed before the business started using this system.
create function public.record_customer_opening_debt(
  p_organization_id uuid,
  p_customer_id uuid,
  p_returnable_item_id uuid,
  p_quantity numeric,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  perform public.require_org_role(p_organization_id, array['owner', 'admin']::public.member_role[]);

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Enter a quantity greater than zero.';
  end if;

  select r.name into v_name
  from public.returnable_items r
  where r.id = p_returnable_item_id and r.organization_id = p_organization_id;
  if v_name is null then
    raise exception 'Choose one of your returnable items.';
  end if;

  if not exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.organization_id = p_organization_id
  ) then
    raise exception 'Choose one of your customers.';
  end if;

  insert into public.returnable_movements (
    organization_id, returnable_item_id, customer_id, owed_delta,
    movement_type, source_type, source_id, movement_date, created_by
  )
  values (
    p_organization_id, p_returnable_item_id, p_customer_id, p_quantity,
    'opening_debt', 'customer', p_customer_id, public.org_today(p_organization_id), auth.uid()
  );

  perform public.write_audit_log(
    p_organization_id, 'record_customer_opening_debt', 'customers', p_customer_id, null,
    jsonb_build_object(
      'returnable', v_name, 'quantity', p_quantity,
      'note', nullif(left(btrim(coalesce(p_note, '')), 500), '')
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.returnable_movements enable row level security;
alter table public.trip_return_lines enable row level security;
alter table public.supplier_exchanges enable row level security;
alter table public.returnable_adjustments enable row level security;

revoke all on
  public.returnable_movements,
  public.trip_return_lines,
  public.supplier_exchanges,
  public.returnable_adjustments,
  public.returnable_totals,
  public.returnable_holdings,
  public.customer_returnable_balances
from anon, authenticated;

grant select on
  public.returnable_movements,
  public.trip_return_lines,
  public.supplier_exchanges,
  public.returnable_adjustments,
  public.returnable_totals,
  public.returnable_holdings,
  public.customer_returnable_balances
to authenticated;

create policy "members read returnable movements"
on public.returnable_movements for select to authenticated
using (public.is_org_member(organization_id));

create policy "members read trip return lines"
on public.trip_return_lines for select to authenticated
using (public.is_org_member(organization_id));

create policy "members read supplier exchanges"
on public.supplier_exchanges for select to authenticated
using (public.is_org_member(organization_id));

create policy "members read returnable adjustments"
on public.returnable_adjustments for select to authenticated
using (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke all on function public.returnable_holding_at(uuid, uuid) from public, anon, authenticated;
revoke all on function public.assert_returnable_event(uuid, uuid, uuid, date, numeric) from public, anon, authenticated;

revoke all on function public.record_trip_returns(uuid, date, jsonb) from public, anon;
revoke all on function public.record_supplier_exchange(uuid, uuid, date, uuid, numeric, text, text, text, text) from public, anon;
revoke all on function public.record_returnable_adjustment(uuid, uuid, date, uuid, text, numeric, public.returnable_adjustment_reason, uuid, text) from public, anon;
revoke all on function public.record_customer_opening_debt(uuid, uuid, uuid, numeric, text) from public, anon;

grant execute on function public.record_trip_returns(uuid, date, jsonb) to authenticated;
grant execute on function public.record_supplier_exchange(uuid, uuid, date, uuid, numeric, text, text, text, text) to authenticated;
grant execute on function public.record_returnable_adjustment(uuid, uuid, date, uuid, text, numeric, public.returnable_adjustment_reason, uuid, text) to authenticated;
grant execute on function public.record_customer_opening_debt(uuid, uuid, uuid, numeric, text) to authenticated;
