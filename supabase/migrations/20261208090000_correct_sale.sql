-- Bilikis's admin sale correction, for a drinks depot: an owner or admin
-- corrects the products and quantities of a sale that has already gone out,
-- in place and with a reason. Stock, the empties the customer owes and the
-- empties expected back with the trip all follow the corrected quantities.
-- A waiting order is still changed with the ordinary edit.

create function public.correct_order(p_order_id uuid, p_items jsonb, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_reason text;
  v_old_items jsonb;
  v_row record;
begin
  select o.id, o.organization_id, o.location_id, o.status, o.order_date, o.order_no, o.customer_id,
         o.voided_at, org.sells_drinks
  into v_order
  from public.orders o
  join public.organizations org on org.id = o.organization_id
  where o.id = p_order_id
  for update of o;

  if not found then
    raise exception 'Order not found.';
  end if;

  perform public.require_org_role(v_order.organization_id, array['owner', 'admin']::public.member_role[]);
  v_reason := public.require_reason(p_reason);

  if not v_order.sells_drinks then
    raise exception 'Only a drinks business corrects a sale in place. Void it and record it again instead.';
  end if;
  if v_order.voided_at is not null then
    raise exception 'This sale was voided, so it cannot be corrected.';
  end if;
  if v_order.status not in ('dispatched', 'completed') then
    raise exception 'This order has not gone out yet. Change it with Edit instead.';
  end if;
  if exists (select 1 from public.product_units u where u.order_id = p_order_id) then
    raise exception 'A sale with serial numbers cannot be corrected in place.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'product_id', i.product_id, 'quantity', trim_scale(i.quantity), 'unit_price', i.unit_price
         ) order by i.product_id), '[]'::jsonb)
  into v_old_items
  from public.order_items i
  where i.order_id = p_order_id;

  -- Stock: the old lines go back, the corrected ones come out, checked
  -- against what is in stock. Prices stay as sold for products already on it.
  perform public.write_order_items(
    v_order.organization_id, p_order_id, v_order.location_id, v_order.order_date, p_items
  );

  -- A PET sale stays PET and an RGB sale stays RGB.
  if (
    select bool_or(p.returnable_item_id is not null)
    from jsonb_to_recordset(v_old_items) as old(product_id uuid, quantity numeric, unit_price numeric)
    join public.products p on p.id = old.product_id
  ) is distinct from (
    select bool_or(i.returnable_item_id is not null) from public.order_items i where i.order_id = p_order_id
  ) then
    raise exception 'A PET sale stays PET and an RGB sale stays RGB. Void it and record it again instead.';
  end if;

  update public.order_items i
  set unit_price = old.unit_price
  from jsonb_to_recordset(v_old_items) as old(product_id uuid, quantity numeric, unit_price numeric)
  where i.order_id = p_order_id and i.product_id = old.product_id;

  -- Empties: what the customer owes from this sale, and what the trip was to bring back.
  for v_row in
    select
      coalesce(n.returnable_item_id, l.returnable_item_id) as returnable_item_id,
      coalesce(n.quantity, 0) as quantity,
      l.id as line_id,
      l.returned_quantity,
      coalesce((
        select sum(f.quantity) from public.empties_followups f
        where f.trip_return_line_id = l.id and f.voided_at is null
      ), 0) as followups
    from (
      select i.returnable_item_id, sum(i.quantity) as quantity
      from public.order_items i
      where i.order_id = p_order_id and i.returnable_item_id is not null
      group by i.returnable_item_id
    ) n
    full join (
      select * from public.trip_return_lines l where l.order_id = p_order_id
    ) l on l.returnable_item_id = n.returnable_item_id
  loop
    if v_row.line_id is not null then
      if v_row.returned_quantity + v_row.followups > v_row.quantity then
        raise exception '% empties already came back for this sale, so it cannot go below that. Correct the returned figure first.',
          trim_scale(v_row.returned_quantity + v_row.followups);
      end if;
      update public.trip_return_lines l
      set expected_quantity = v_row.quantity
      where l.id = v_row.line_id;
    end if;
  end loop;

  delete from public.returnable_movements m
  where m.source_type = 'order' and m.source_id = p_order_id and m.movement_type = 'dispatch';

  insert into public.returnable_movements (
    organization_id, returnable_item_id, customer_id, owed_delta,
    movement_type, source_type, source_id, movement_date, created_by
  )
  select
    v_order.organization_id, i.returnable_item_id, v_order.customer_id, sum(i.quantity),
    'dispatch', 'order', p_order_id,
    coalesce((
      select t.dispatch_date
      from public.dispatch_trip_orders dto
      join public.dispatch_trips t on t.id = dto.trip_id
      where dto.order_id = p_order_id
      limit 1
    ), v_order.order_date),
    auth.uid()
  from public.order_items i
  where i.order_id = p_order_id and i.returnable_item_id is not null
  group by i.returnable_item_id;

  update public.orders o set updated_at = now() where o.id = p_order_id;

  perform public.write_audit_log(
    v_order.organization_id, 'correct_order', 'orders', p_order_id,
    jsonb_build_object('order_no', v_order.order_no, 'items', v_old_items),
    jsonb_build_object(
      'order_no', v_order.order_no,
      'reason', v_reason,
      'items', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'product_id', i.product_id, 'quantity', trim_scale(i.quantity), 'unit_price', i.unit_price
               ) order by i.product_id), '[]'::jsonb)
        from public.order_items i where i.order_id = p_order_id
      )
    )
  );
end;
$$;

revoke all on function public.correct_order(uuid, jsonb, text) from public, anon;
grant execute on function public.correct_order(uuid, jsonb, text) to authenticated;
