-- Follow-up empties returns are recorded by owners and admins only, as in
-- Bilikis. Staff still record what comes back with a trip.

create or replace function public.record_empties_followup(
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

  -- As in Bilikis, only owners and admins record follow-up returns.
  perform public.require_org_role(
    v_line.organization_id, array['owner', 'admin']::public.member_role[]
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
