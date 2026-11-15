-- Drinks empties, the Bilikis way: one shortage line per order on a trip.
--
--   Expected       = RGB crates on the order (fixed when it goes on a trip)
--   Total returned = returned at trip close + follow-up returns on that line
--   Outstanding    = max(Expected - Total returned, 0)
--   Status         = open while Outstanding > 0, completed at 0 (stays listed)
--
-- No running credit: extra empties at trip close go into the store but do not
-- pay off anything else. A follow-up return pays off one line only and never
-- more than it still owes.
--
-- Empties in store = opening + trip returns + follow-ups + adjustments
--                    - empties taken by the supplier   (returnable_movements)

create table public.empties_followups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  trip_return_line_id uuid not null references public.trip_return_lines (id) on delete cascade,
  quantity numeric(14, 2) not null check (quantity > 0),
  received_date date not null,
  note text,
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  void_reason text
);

create index empties_followups_line_idx on public.empties_followups (trip_return_line_id);
create index empties_followups_recent_idx on public.empties_followups (organization_id, created_at desc);

alter table public.empties_followups enable row level security;
revoke all on public.empties_followups from anon, authenticated;
grant select on public.empties_followups to authenticated;

create policy "members read empties follow-ups"
on public.empties_followups for select to authenticated
using (public.is_org_member(organization_id));

-- Every order that came back short, open or completed.
create view public.empty_shortage_lines
with (security_invoker = true) as
select
  l.id,
  l.organization_id,
  l.trip_id,
  t.trip_no,
  t.location_id,
  l.order_id,
  o.order_no,
  o.order_date,
  o.customer_id,
  coalesce(c.name, nullif(o.buyer_name, ''), 'Walk-in buyer') as customer_name,
  l.returnable_item_id,
  r.name as returnable_name,
  t.returned_date,
  t.returns_recorded_at as returned_at,
  l.expected_quantity as expected,
  l.returned_quantity as initial_returned,
  coalesce(f.total, 0)::numeric(14, 2) as followup_returned,
  (l.returned_quantity + coalesce(f.total, 0))::numeric(14, 2) as total_returned,
  greatest(l.expected_quantity - l.returned_quantity - coalesce(f.total, 0), 0)::numeric(14, 2) as outstanding,
  f.last_at as last_followup_at,
  case
    when l.expected_quantity - l.returned_quantity - coalesce(f.total, 0) <= 0 then f.last_at
  end as completed_at
from public.trip_return_lines l
join public.dispatch_trips t on t.id = l.trip_id
join public.orders o on o.id = l.order_id
join public.returnable_items r on r.id = l.returnable_item_id
left join public.customers c on c.id = o.customer_id
left join (
  select
    f.trip_return_line_id,
    sum(f.quantity) as total,
    max(f.created_at) as last_at
  from public.empties_followups f
  where f.voided_at is null
  group by f.trip_return_line_id
) f on f.trip_return_line_id = l.id
where l.returned_quantity < l.expected_quantity
  and o.voided_at is null;

revoke all on public.empty_shortage_lines from anon, authenticated;
grant select on public.empty_shortage_lines to authenticated;

-- ---------------------------------------------------------------------------
-- A customer brings back empties later, against one order that came back short
-- ---------------------------------------------------------------------------

create function public.record_empties_followup(
  p_line_id uuid,
  p_quantity numeric,
  p_received_date date,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line record;
  v_followups numeric;
  v_outstanding numeric;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
  v_followup_id uuid;
begin
  if p_line_id is null then
    raise exception 'Choose the order the empties are for.';
  end if;

  -- Locked so two people cannot both settle the same shortage.
  select l.id, l.organization_id, l.trip_id, l.order_id, l.returnable_item_id,
         l.expected_quantity, l.returned_quantity,
         t.location_id, t.trip_no, t.returned_date,
         o.customer_id, o.order_no, o.status as order_status, o.voided_at
  into v_line
  from public.trip_return_lines l
  join public.dispatch_trips t on t.id = l.trip_id
  join public.orders o on o.id = l.order_id
  where l.id = p_line_id
  for update of l;

  if not found then
    raise exception 'That shortage was not found.';
  end if;

  perform public.require_org_role(
    v_line.organization_id, array['owner', 'admin', 'staff']::public.member_role[]
  );

  if v_line.voided_at is not null or v_line.order_status = 'cancelled' then
    raise exception 'Empties cannot be recorded for a cancelled or voided order.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Enter how many empties they brought back, more than 0.';
  end if;
  if p_quantity <> trunc(p_quantity) then
    raise exception 'Empties are counted in whole numbers.';
  end if;

  if p_received_date is null then
    raise exception 'Enter the date they brought them back.';
  end if;
  if p_received_date > public.org_today(v_line.organization_id) then
    raise exception 'The date cannot be in the future.';
  end if;
  if v_line.returned_date is not null and p_received_date < v_line.returned_date then
    raise exception 'The date cannot be before the trip came back (%).', to_char(v_line.returned_date, 'DD Mon YYYY');
  end if;

  select coalesce(sum(f.quantity), 0) into v_followups
  from public.empties_followups f
  where f.trip_return_line_id = p_line_id and f.voided_at is null;

  v_outstanding := greatest(v_line.expected_quantity - v_line.returned_quantity - v_followups, 0);

  if v_outstanding = 0 then
    raise exception 'This empty shortage is already settled.';
  end if;
  if p_quantity > v_outstanding then
    raise exception 'Only % empties are still owed on %, so % cannot be recorded.',
      trim_scale(v_outstanding), v_line.order_no, trim_scale(p_quantity);
  end if;

  insert into public.empties_followups (
    organization_id, trip_return_line_id, quantity, received_date, note, recorded_by
  )
  values (v_line.organization_id, p_line_id, p_quantity, p_received_date, v_note, auth.uid())
  returning empties_followups.id into v_followup_id;

  insert into public.returnable_movements (
    organization_id, returnable_item_id, location_id, customer_id, holding_delta, owed_delta,
    movement_type, source_type, source_id, movement_date, created_by
  )
  values (
    v_line.organization_id, v_line.returnable_item_id, v_line.location_id, v_line.customer_id,
    p_quantity, -p_quantity,
    'trip_return', 'empties_followup', v_followup_id, p_received_date, auth.uid()
  );

  perform public.write_audit_log(
    v_line.organization_id, 'record_empties_followup', 'orders', v_line.order_id,
    jsonb_build_object('outstanding', v_outstanding),
    jsonb_build_object(
      'order_no', v_line.order_no, 'trip_no', v_line.trip_no, 'quantity', p_quantity,
      'received_date', p_received_date, 'note', v_note,
      'outstanding', v_outstanding - p_quantity
    )
  );

  return v_followup_id;
end;
$$;

-- Undo a follow-up recorded by mistake.
create function public.void_empties_followup(p_followup_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_followup record;
  v_reason text;
  v_holding numeric;
begin
  select f.id, f.organization_id, f.quantity, f.voided_at, f.received_date,
         l.returnable_item_id, l.order_id, t.location_id, o.order_no
  into v_followup
  from public.empties_followups f
  join public.trip_return_lines l on l.id = f.trip_return_line_id
  join public.dispatch_trips t on t.id = l.trip_id
  join public.orders o on o.id = l.order_id
  where f.id = p_followup_id
  for update of f;

  if not found then
    raise exception 'That follow-up return was not found.';
  end if;

  perform public.require_org_role(v_followup.organization_id, array['owner', 'admin']::public.member_role[]);
  v_reason := public.require_reason(p_reason);

  if v_followup.voided_at is not null then
    raise exception 'This follow-up return has already been voided.';
  end if;

  perform 1 from public.returnable_items r where r.id = v_followup.returnable_item_id for update;
  v_holding := public.returnable_holding_at(v_followup.returnable_item_id, v_followup.location_id);
  if v_holding < v_followup.quantity then
    raise exception 'It cannot be voided: only % empties are in store now.', trim_scale(v_holding);
  end if;

  delete from public.returnable_movements m
  where m.source_type = 'empties_followup' and m.source_id = p_followup_id;

  update public.empties_followups f
  set voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
  where f.id = p_followup_id;

  perform public.write_audit_log(
    v_followup.organization_id, 'void_empties_followup', 'orders', v_followup.order_id,
    jsonb_build_object('quantity', v_followup.quantity, 'received_date', v_followup.received_date),
    jsonb_build_object('order_no', v_followup.order_no, 'reason', v_reason)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Changed: trip returns, return corrections, voids and the old customer return
-- ---------------------------------------------------------------------------

create or replace function public.record_trip_returns(
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
  v_drinks boolean;
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

  select coalesce(org.sells_drinks, false) into v_drinks
  from public.organizations org where org.id = v_trip.organization_id;

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
      and o.status = 'dispatched'
      and i.returnable_item_id is not null
    group by o.id, o.customer_id, i.returnable_item_id
  ) e;

  v_expected_count := jsonb_array_length(v_expected);

  select count(*) into v_given_count
  from jsonb_to_recordset(p_returns) as r(order_id uuid, returnable_item_id uuid, quantity numeric);

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
    -- Drinks: extra empties go into the store but are not credit, so a
    -- customer's debt never drops below what this order still owes.
    r.quantity,
    case when v_drinks then -least(r.quantity, e.expected_quantity) else -r.quantity end,
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

create or replace function public.correct_trip_return(
  p_line_id uuid,
  p_returned_quantity numeric,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line record;
  v_reason text;
  v_delta numeric;
  v_holding numeric;
  v_drinks boolean;
  v_followups numeric;
  v_owed_delta numeric;
begin
  select l.id, l.organization_id, l.trip_id, l.order_id, l.returnable_item_id, l.returned_quantity,
         l.expected_quantity, coalesce(org.sells_drinks, false) as sells_drinks,
         t.location_id, t.trip_no, o.customer_id
  into v_line
  from public.trip_return_lines l
  join public.dispatch_trips t on t.id = l.trip_id
  join public.orders o on o.id = l.order_id
  join public.organizations org on org.id = l.organization_id
  where l.id = p_line_id
  for update of l;

  if not found then
    raise exception 'Return record not found.';
  end if;

  perform public.require_org_role(v_line.organization_id, array['owner', 'admin']::public.member_role[]);
  v_reason := public.require_reason(p_reason);

  if p_returned_quantity is null or p_returned_quantity < 0 then
    raise exception 'Enter a number, zero or more.';
  end if;

  v_delta := p_returned_quantity - v_line.returned_quantity;
  if v_delta = 0 then
    raise exception 'That is the figure already recorded.';
  end if;

  v_drinks := v_line.sells_drinks;
  v_owed_delta := -v_delta;
  if v_drinks then
    if p_returned_quantity <> trunc(p_returned_quantity) then
      raise exception 'Empties are counted in whole numbers.';
    end if;
    select coalesce(sum(f.quantity), 0) into v_followups
    from public.empties_followups f
    where f.trip_return_line_id = p_line_id and f.voided_at is null;
    if v_followups > 0 and p_returned_quantity + v_followups > v_line.expected_quantity then
      raise exception '% empties were already brought back later for this order, so the trip figure can be at most %.',
        trim_scale(v_followups), trim_scale(v_line.expected_quantity - v_followups);
    end if;
    v_owed_delta := least(v_line.returned_quantity, v_line.expected_quantity)
      - least(p_returned_quantity, v_line.expected_quantity);
  end if;

  if v_delta < 0 then
    perform 1 from public.returnable_items r where r.id = v_line.returnable_item_id for update;
    v_holding := public.returnable_holding_at(v_line.returnable_item_id, v_line.location_id);
    if v_holding < -v_delta then
      raise exception 'The figure cannot be lowered by %: only % are in store now.',
        trim_scale(-v_delta), trim_scale(v_holding);
    end if;
  end if;

  update public.trip_return_lines l
  set returned_quantity = p_returned_quantity, corrected_at = now()
  where l.id = p_line_id;

  -- The difference moves between the store and the customer's balance.
  insert into public.returnable_movements (
    organization_id, returnable_item_id, location_id, customer_id, holding_delta, owed_delta,
    movement_type, source_type, source_id, movement_date, created_by
  )
  values (
    v_line.organization_id, v_line.returnable_item_id, v_line.location_id, v_line.customer_id,
    v_delta, v_owed_delta,
    'trip_return', 'dispatch_trip', v_line.trip_id, public.org_today(v_line.organization_id), auth.uid()
  );

  perform public.write_audit_log(
    v_line.organization_id, 'correct_trip_return', 'dispatch_trips', v_line.trip_id,
    jsonb_build_object('returned', v_line.returned_quantity),
    jsonb_build_object('trip_no', v_line.trip_no, 'returned', p_returned_quantity, 'reason', v_reason)
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
      -(coalesce(r.returned, 0) + coalesce(r.followups, 0)),
      coalesce(r.settled, 0) + coalesce(r.followups, 0) - e.expected,
      'adjustment', 'order_void', p_order_id, public.org_today(v_order.organization_id), auth.uid()
    from (
      select i.returnable_item_id, sum(i.quantity) as expected
      from public.order_items i
      where i.order_id = p_order_id and i.returnable_item_id is not null
      group by i.returnable_item_id
    ) e
    left join (
      -- What came back with the trip, how much of it paid off this order
      -- (drinks: never more than expected), and later follow-up returns.
      select
        l.returnable_item_id,
        sum(l.returned_quantity) as returned,
        sum(case when coalesce(org.sells_drinks, false)
                 then least(l.returned_quantity, l.expected_quantity)
                 else l.returned_quantity end) as settled,
        sum((
          select coalesce(sum(f.quantity), 0)
          from public.empties_followups f
          where f.trip_return_line_id = l.id and f.voided_at is null
        )) as followups
      from public.trip_return_lines l
      join public.organizations org on org.id = l.organization_id
      where l.order_id = p_order_id
      group by l.returnable_item_id
    ) r on r.returnable_item_id = e.returnable_item_id
    where (coalesce(r.returned, 0) + coalesce(r.followups, 0)) <> 0
       or coalesce(r.settled, 0) + coalesce(r.followups, 0) - e.expected <> 0;

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

create or replace function public.record_customer_empties_return(
  p_organization_id uuid,
  p_location_id uuid,
  p_return_date date,
  p_returnable_item_id uuid,
  p_customer_id uuid,
  p_quantity numeric,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_customer text;
  v_owed numeric;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
  v_adjustment_id uuid;
begin
  perform public.require_org_role(p_organization_id, array['owner', 'admin', 'staff']::public.member_role[]);
  if exists (
    select 1 from public.organizations org
    where org.id = p_organization_id and org.sells_drinks
  ) then
    raise exception 'Record empties a customer brings back against their order on the Empty shortages page.';
  end if;
  v_name := public.assert_returnable_event(
    p_organization_id, p_location_id, p_returnable_item_id, p_return_date, p_quantity
  );

  -- Locked so two people cannot both settle the same shortage.
  select c.name into v_customer
  from public.customers c
  where c.id = p_customer_id and c.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'Choose one of your customers.';
  end if;

  select coalesce(sum(m.owed_delta), 0) into v_owed
  from public.returnable_movements m
  where m.customer_id = p_customer_id and m.returnable_item_id = p_returnable_item_id;

  if p_quantity > v_owed then
    raise exception '% owes % %, so % cannot be recorded. If they brought back more, an owner or admin can add the extra as an adjustment.',
      v_customer, trim_scale(greatest(v_owed, 0)), v_name, trim_scale(p_quantity);
  end if;

  insert into public.returnable_adjustments (
    organization_id, location_id, adjustment_date, returnable_item_id, quantity_delta,
    reason, customer_id, note, created_by
  )
  values (
    p_organization_id, p_location_id, p_return_date, p_returnable_item_id, p_quantity,
    'customer_return', p_customer_id, v_note, auth.uid()
  )
  returning returnable_adjustments.id into v_adjustment_id;

  insert into public.returnable_movements (
    organization_id, returnable_item_id, location_id, customer_id, holding_delta, owed_delta,
    movement_type, source_type, source_id, movement_date, created_by
  )
  values (
    p_organization_id, p_returnable_item_id, p_location_id, p_customer_id, p_quantity, -p_quantity,
    'adjustment', 'returnable_adjustment', v_adjustment_id, p_return_date, auth.uid()
  );

  perform public.write_audit_log(
    p_organization_id, 'record_customer_empties_return', 'returnable_adjustments', v_adjustment_id, null,
    jsonb_build_object('returnable', v_name, 'customer', v_customer, 'quantity', p_quantity, 'note', v_note)
  );

  return v_adjustment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Several customers' orders saved together (the drinks order screen)
-- ---------------------------------------------------------------------------

create function public.create_order_batch(
  p_organization_id uuid,
  p_location_id uuid,
  p_order_date date,
  p_payment_type public.payment_type,
  p_note text,
  p_orders jsonb
)
returns table (id uuid, order_no text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_name text;
begin
  perform public.require_org_role(
    p_organization_id, array['owner', 'admin', 'staff']::public.member_role[]
  );

  if p_orders is null or jsonb_typeof(p_orders) <> 'array' or jsonb_array_length(p_orders) = 0 then
    raise exception 'Add at least one customer.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_orders) as o(customer_id uuid, items jsonb)
    where o.customer_id is null
      or o.items is null
      or jsonb_typeof(o.items) <> 'array'
      or jsonb_array_length(o.items) = 0
  ) then
    raise exception 'Every customer needs a name and at least one product.';
  end if;

  select c.name into v_name
  from jsonb_to_recordset(p_orders) as o(customer_id uuid, items jsonb)
  join public.customers c on c.id = o.customer_id
  group by c.id, c.name
  having count(*) > 1
  limit 1;
  if v_name is not null then
    raise exception '% is in this list twice. Put all their products on one card.', v_name;
  end if;

  -- The whole list must fit in stock together, so check it before saving any.
  select p.name into v_name
  from (
    select (i ->> 'product_id')::uuid as product_id, sum((i ->> 'quantity')::numeric) as quantity
    from jsonb_to_recordset(p_orders) as o(customer_id uuid, items jsonb)
    cross join lateral jsonb_array_elements(o.items) as i
    group by 1
  ) wanted
  join public.products p on p.id = wanted.product_id and p.organization_id = p_organization_id
  where wanted.quantity > coalesce((
    select sum(m.qty_in - m.qty_out)
    from public.stock_movements m
    where m.product_id = wanted.product_id and m.location_id = p_location_id
  ), 0)
  limit 1;
  if v_name is not null then
    raise exception 'Not enough % in stock for everyone on this list.', v_name;
  end if;

  for v_order in
    select (e.value ->> 'customer_id')::uuid as customer_id, e.value -> 'items' as items
    from jsonb_array_elements(p_orders) with ordinality as e(value, position)
    order by e.position
  loop
    return query
    select created.id, created.order_no
    from public.create_order(
      p_organization_id, p_location_id, p_order_date, v_order.customer_id,
      p_payment_type, p_note, v_order.items, false, null, null
    ) as created;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Existing drinks data: same rules from now on
-- ---------------------------------------------------------------------------

do $$
declare
  v_line record;
  v_return record;
  v_left numeric;
  v_take numeric;
  v_followup_id uuid;
begin
  -- 1. Extra empties at trip close are no longer credit.
  insert into public.returnable_movements (
    organization_id, returnable_item_id, location_id, customer_id, holding_delta, owed_delta,
    movement_type, source_type, source_id, movement_date, created_by
  )
  select
    l.organization_id, l.returnable_item_id, t.location_id, o.customer_id,
    0, l.returned_quantity - l.expected_quantity,
    'adjustment', 'drinks_no_credit', l.id, coalesce(t.returned_date, t.dispatch_date), null
  from public.trip_return_lines l
  join public.dispatch_trips t on t.id = l.trip_id
  join public.orders o on o.id = l.order_id
  join public.organizations org on org.id = l.organization_id
  where org.sells_drinks
    and o.customer_id is not null
    and l.returned_quantity > l.expected_quantity;

  -- 2. Empties customers brought back on the old form become follow-ups on
  --    their oldest shortages first. Whatever fits nowhere stays as it was.
  for v_return in
    select a.id, a.organization_id, a.customer_id, a.returnable_item_id, a.quantity_delta,
           a.adjustment_date, a.note, a.created_by, a.created_at
    from public.returnable_adjustments a
    join public.organizations org on org.id = a.organization_id
    where org.sells_drinks
      and a.reason = 'customer_return'
      and a.customer_id is not null
      and a.voided_at is null
    order by a.created_at
  loop
    v_left := v_return.quantity_delta;

    for v_line in
      select s.id, s.outstanding, s.returned_date, s.location_id
      from public.empty_shortage_lines s
      where s.organization_id = v_return.organization_id
        and s.customer_id = v_return.customer_id
        and s.returnable_item_id = v_return.returnable_item_id
        and s.outstanding > 0
        and (s.returned_date is null or s.returned_date <= v_return.adjustment_date)
      order by s.returned_at, s.order_no
    loop
      exit when v_left <= 0;
      v_take := least(v_left, v_line.outstanding);

      insert into public.empties_followups (
        organization_id, trip_return_line_id, quantity, received_date, note, recorded_by, created_at
      )
      values (
        v_return.organization_id, v_line.id, v_take, v_return.adjustment_date,
        v_return.note, v_return.created_by, v_return.created_at
      )
      returning empties_followups.id into v_followup_id;

      insert into public.returnable_movements (
        organization_id, returnable_item_id, location_id, customer_id, holding_delta, owed_delta,
        movement_type, source_type, source_id, movement_date, created_by, created_at
      )
      values (
        v_return.organization_id, v_return.returnable_item_id, v_line.location_id, v_return.customer_id,
        v_take, -v_take,
        'trip_return', 'empties_followup', v_followup_id, v_return.adjustment_date,
        v_return.created_by, v_return.created_at
      );

      v_left := v_left - v_take;
    end loop;

    if v_left < v_return.quantity_delta then
      delete from public.returnable_movements m
      where m.source_type = 'returnable_adjustment' and m.source_id = v_return.id;

      if v_left > 0 then
        update public.returnable_adjustments a set quantity_delta = v_left where a.id = v_return.id;
        insert into public.returnable_movements (
          organization_id, returnable_item_id, location_id, customer_id, holding_delta, owed_delta,
          movement_type, source_type, source_id, movement_date, created_by, created_at
        )
        select a.organization_id, a.returnable_item_id, a.location_id, a.customer_id, v_left, -v_left,
               'adjustment', 'returnable_adjustment', a.id, a.adjustment_date, a.created_by, a.created_at
        from public.returnable_adjustments a where a.id = v_return.id;
      else
        update public.returnable_adjustments a
        set voided_at = now(), void_reason = 'Moved to follow-up returns on the orders it paid off.'
        where a.id = v_return.id;
      end if;
    end if;
  end loop;
end;
$$;

-- From now on a drinks customer can only owe empties through an order on a
-- trip, so every crate owed shows as a line on the Empty shortages page.
create function public.drinks_debts_per_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owed_delta <> 0
     and (new.movement_type = 'opening_debt'
          or (new.movement_type = 'adjustment' and new.source_type = 'returnable_adjustment'))
     and exists (select 1 from public.organizations org where org.id = new.organization_id and org.sells_drinks)
  then
    raise exception 'For drinks, empties are owed per order. Record what a customer brings back against that order on the Empty shortages page.';
  end if;
  return new;
end;
$$;

create trigger returnable_movements_drinks_debts_per_order
before insert on public.returnable_movements
for each row execute function public.drinks_debts_per_order();

revoke all on function public.drinks_debts_per_order() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke all on function public.record_empties_followup(uuid, numeric, date, text) from public, anon;
revoke all on function public.void_empties_followup(uuid, text) from public, anon;
revoke all on function public.create_order_batch(uuid, uuid, date, public.payment_type, text, jsonb) from public, anon;

grant execute on function public.record_empties_followup(uuid, numeric, date, text) to authenticated;
grant execute on function public.void_empties_followup(uuid, text) to authenticated;
grant execute on function public.create_order_batch(uuid, uuid, date, public.payment_type, text, jsonb) to authenticated;
