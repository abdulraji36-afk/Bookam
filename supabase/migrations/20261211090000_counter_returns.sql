-- A depot (drinks or goods) that sells at the counter: a returnable order
-- handed over at the counter now waits for what comes back, exactly as an
-- order out on a trip does. It is held on a "Counter" trip of its own, so
-- what comes back is recorded the same way (Record returns), and shortages,
-- follow-ups, corrections, voids and reports all work as they do for trips.
-- Orders with nothing to bring back are completed straight away, as before.

create or replace function public.hand_over_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_depot boolean;
  v_returnable boolean;
  v_today date;
  v_trip_id uuid;
  v_trip_no text;
begin
  select o.id, o.organization_id, o.location_id, o.customer_id, o.status, o.order_no
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

  select org.sells_drinks into v_depot from public.organizations org where org.id = v_order.organization_id;
  select exists (
    select 1 from public.order_items i where i.order_id = p_order_id and i.returnable_item_id is not null
  ) into v_returnable;
  v_today := public.org_today(v_order.organization_id);

  -- From now the customer owes back what comes in a returnable container.
  insert into public.returnable_movements (
    organization_id, returnable_item_id, customer_id, owed_delta,
    movement_type, source_type, source_id, movement_date, created_by
  )
  select
    v_order.organization_id, i.returnable_item_id, v_order.customer_id, sum(i.quantity),
    'dispatch', 'order', p_order_id, v_today, auth.uid()
  from public.order_items i
  where i.order_id = p_order_id and i.returnable_item_id is not null
  group by i.returnable_item_id;

  update public.product_units u
  set status = 'sold', sold_at = now()
  where u.order_id = p_order_id;

  if v_depot and v_returnable then
    v_trip_no := public.next_document_number(v_order.organization_id, 'dispatch_trip', 'TRP', v_today);
    insert into public.dispatch_trips (
      organization_id, location_id, trip_no, dispatch_date, driver_name, status, note, dispatched_at, created_by
    )
    values (
      v_order.organization_id, v_order.location_id, v_trip_no, v_today, 'Counter', 'dispatched',
      'Handed over at the counter', now(), auth.uid()
    )
    returning id into v_trip_id;

    insert into public.dispatch_trip_orders (organization_id, trip_id, order_id)
    values (v_order.organization_id, v_trip_id, p_order_id);

    update public.orders o
    set status = 'dispatched', handed_over_at = now(), updated_at = now()
    where o.id = p_order_id;
  else
    update public.orders o
    set status = 'completed', handed_over_at = now(), updated_at = now()
    where o.id = p_order_id;
  end if;

  perform public.write_audit_log(
    v_order.organization_id, 'hand_over_order', 'orders', p_order_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object(
      'order_no', v_order.order_no,
      'status', case when v_depot and v_returnable then 'dispatched' else 'completed' end,
      'trip_no', v_trip_no
    )
  );
end;
$$;
