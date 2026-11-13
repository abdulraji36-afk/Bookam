-- Iteration 5: undoing mistakes (voids and corrections) and the daily report.
--
-- Only owners and admins can void or correct, and every one needs a reason.
-- A void removes the record's effect on stock and returnables but keeps the
-- record itself, marked as voided, and writes what it was to the audit log.

alter table public.orders
  add column voided_at timestamptz,
  add column voided_by uuid references public.profiles (id) on delete set null,
  add column void_reason text,
  add column voided_from_status text;

alter table public.stock_receipts
  add column voided_at timestamptz,
  add column voided_by uuid references public.profiles (id) on delete set null,
  add column void_reason text;

alter table public.supplier_exchanges
  add column voided_at timestamptz,
  add column voided_by uuid references public.profiles (id) on delete set null,
  add column void_reason text;

alter table public.returnable_adjustments
  add column voided_at timestamptz,
  add column voided_by uuid references public.profiles (id) on delete set null,
  add column void_reason text;

alter table public.trip_return_lines
  add column corrected_at timestamptz;

-- ---------------------------------------------------------------------------
-- Views: show the void flag, and stop voided or cancelled orders counting
-- towards a trip's totals.
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
  c.name as customer_name,
  c.area as customer_area,
  coalesce(t.total_quantity, 0)::numeric(14, 2) as total_quantity,
  coalesce(t.total_amount, 0)::numeric(16, 2) as total_amount,
  coalesce(t.has_returns, false) as has_returns,
  dt.id as trip_id,
  dt.trip_no,
  o.created_at,
  o.voided_at
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

create or replace view public.dispatch_trip_summaries
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
  count(distinct o.id)::integer as order_count,
  coalesce(sum(i.quantity), 0)::numeric(14, 2) as total_quantity,
  coalesce(sum(i.line_total), 0)::numeric(16, 2) as total_amount,
  coalesce(bool_or(i.returnable_item_id is not null), false) as has_returns
from public.dispatch_trips t
left join public.dispatch_trip_orders dto on dto.trip_id = t.id
left join public.orders o on o.id = dto.order_id and o.status <> 'cancelled'
left join public.order_items i on i.order_id = o.id
group by t.id;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.require_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if char_length(v_reason) < 5 then
    raise exception 'Give a reason, in at least a few words.';
  end if;
  return left(v_reason, 500);
end;
$$;

-- ---------------------------------------------------------------------------
-- Trip returns must ignore orders that were voided while the trip was out.
-- (Same as before apart from the status filter on the expected list.)
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
-- Voiding an order, at any stage
-- ---------------------------------------------------------------------------

create function public.void_order(p_order_id uuid, p_reason text)
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

-- ---------------------------------------------------------------------------
-- Voiding a stock receipt
-- ---------------------------------------------------------------------------

create function public.void_stock_receipt(p_receipt_id uuid, p_reason text)
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
-- Voiding a supplier exchange or an adjustment
-- ---------------------------------------------------------------------------

create function public.void_supplier_exchange(p_exchange_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exchange record;
  v_reason text;
begin
  select e.id, e.organization_id, e.exchange_no, e.quantity_taken, e.voided_at
  into v_exchange
  from public.supplier_exchanges e
  where e.id = p_exchange_id
  for update;

  if not found then
    raise exception 'Supplier exchange not found.';
  end if;

  perform public.require_org_role(v_exchange.organization_id, array['owner', 'admin']::public.member_role[]);
  v_reason := public.require_reason(p_reason);

  if v_exchange.voided_at is not null then
    raise exception 'This supplier exchange has already been voided.';
  end if;

  delete from public.returnable_movements m
  where m.source_type = 'supplier_exchange' and m.source_id = p_exchange_id;

  update public.supplier_exchanges e
  set voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
  where e.id = p_exchange_id;

  perform public.write_audit_log(
    v_exchange.organization_id, 'void_supplier_exchange', 'supplier_exchanges', p_exchange_id,
    jsonb_build_object('quantity_taken', v_exchange.quantity_taken),
    jsonb_build_object('exchange_no', v_exchange.exchange_no, 'reason', v_reason)
  );
end;
$$;

create function public.void_returnable_adjustment(p_adjustment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_adjustment record;
  v_reason text;
  v_holding numeric;
begin
  select a.id, a.organization_id, a.location_id, a.returnable_item_id, a.quantity_delta, a.reason,
         a.customer_id, a.voided_at
  into v_adjustment
  from public.returnable_adjustments a
  where a.id = p_adjustment_id
  for update;

  if not found then
    raise exception 'Adjustment not found.';
  end if;

  perform public.require_org_role(v_adjustment.organization_id, array['owner', 'admin']::public.member_role[]);
  v_reason := public.require_reason(p_reason);

  if v_adjustment.voided_at is not null then
    raise exception 'This adjustment has already been voided.';
  end if;

  -- Undoing an "add" takes them back out of the store, so they must still be there.
  if v_adjustment.quantity_delta > 0 then
    perform 1 from public.returnable_items r where r.id = v_adjustment.returnable_item_id for update;
    v_holding := public.returnable_holding_at(v_adjustment.returnable_item_id, v_adjustment.location_id);
    if v_holding < v_adjustment.quantity_delta then
      raise exception 'This adjustment cannot be voided: it added %, but only % are in store now.',
        trim_scale(v_adjustment.quantity_delta), trim_scale(v_holding);
    end if;
  end if;

  delete from public.returnable_movements m
  where m.source_type = 'returnable_adjustment' and m.source_id = p_adjustment_id;

  update public.returnable_adjustments a
  set voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
  where a.id = p_adjustment_id;

  perform public.write_audit_log(
    v_adjustment.organization_id, 'void_returnable_adjustment', 'returnable_adjustments', p_adjustment_id,
    jsonb_build_object(
      'quantity_delta', v_adjustment.quantity_delta, 'reason', v_adjustment.reason,
      'customer_id', v_adjustment.customer_id
    ),
    jsonb_build_object('reason', v_reason)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Correcting what a customer returned with a trip
-- ---------------------------------------------------------------------------

create function public.correct_trip_return(
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
begin
  select l.id, l.organization_id, l.trip_id, l.order_id, l.returnable_item_id, l.returned_quantity,
         t.location_id, t.trip_no, o.customer_id
  into v_line
  from public.trip_return_lines l
  join public.dispatch_trips t on t.id = l.trip_id
  join public.orders o on o.id = l.order_id
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
    v_delta, -v_delta,
    'trip_return', 'dispatch_trip', v_line.trip_id, public.org_today(v_line.organization_id), auth.uid()
  );

  perform public.write_audit_log(
    v_line.organization_id, 'correct_trip_return', 'dispatch_trips', v_line.trip_id,
    jsonb_build_object('returned', v_line.returned_quantity),
    jsonb_build_object('trip_no', v_line.trip_no, 'returned', p_returned_quantity, 'reason', v_reason)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Daily report figures. These run with the caller's own access, so row level
-- security limits them to the caller's businesses.
-- ---------------------------------------------------------------------------

create function public.daily_stock_report(p_organization_id uuid, p_date date)
returns table (
  product_id uuid,
  name text,
  unit text,
  opening numeric,
  received numeric,
  sold numeric,
  closing numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.name,
    p.unit,
    coalesce(sum(m.qty_in - m.qty_out) filter (where m.movement_date < p_date), 0),
    coalesce(sum(m.qty_in) filter (where m.movement_date = p_date), 0),
    coalesce(sum(m.qty_out) filter (where m.movement_date = p_date), 0),
    coalesce(sum(m.qty_in - m.qty_out) filter (where m.movement_date <= p_date), 0)
  from public.products p
  left join public.stock_movements m on m.product_id = p.id
  where p.organization_id = p_organization_id
  group by p.id, p.name, p.unit, p.is_active
  having p.is_active or count(m.id) > 0
  order by p.name;
$$;

create function public.daily_returnables_report(p_organization_id uuid, p_date date)
returns table (
  returnable_item_id uuid,
  name text,
  opening numeric,
  came_in numeric,
  went_out numeric,
  closing numeric,
  owed_closing numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    r.id,
    r.name,
    coalesce(sum(m.holding_delta) filter (where m.movement_date < p_date), 0),
    coalesce(sum(m.holding_delta) filter (where m.movement_date = p_date and m.holding_delta > 0), 0),
    coalesce(-sum(m.holding_delta) filter (where m.movement_date = p_date and m.holding_delta < 0), 0),
    coalesce(sum(m.holding_delta) filter (where m.movement_date <= p_date), 0),
    coalesce(sum(m.owed_delta) filter (where m.movement_date <= p_date), 0)
  from public.returnable_items r
  left join public.returnable_movements m on m.returnable_item_id = r.id
  where r.organization_id = p_organization_id
  group by r.id, r.name
  order by r.name;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke all on function public.require_reason(text) from public, anon, authenticated;

revoke all on function public.void_order(uuid, text) from public, anon;
revoke all on function public.void_stock_receipt(uuid, text) from public, anon;
revoke all on function public.void_supplier_exchange(uuid, text) from public, anon;
revoke all on function public.void_returnable_adjustment(uuid, text) from public, anon;
revoke all on function public.correct_trip_return(uuid, numeric, text) from public, anon;
revoke all on function public.daily_stock_report(uuid, date) from public, anon;
revoke all on function public.daily_returnables_report(uuid, date) from public, anon;

grant execute on function public.void_order(uuid, text) to authenticated;
grant execute on function public.void_stock_receipt(uuid, text) to authenticated;
grant execute on function public.void_supplier_exchange(uuid, text) to authenticated;
grant execute on function public.void_returnable_adjustment(uuid, text) to authenticated;
grant execute on function public.correct_trip_return(uuid, numeric, text) to authenticated;
grant execute on function public.daily_stock_report(uuid, date) to authenticated;
grant execute on function public.daily_returnables_report(uuid, date) to authenticated;
