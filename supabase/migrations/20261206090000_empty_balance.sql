-- Bilikis's Empty Balance page: an owner or admin sets the opening empties
-- (the crates already on the ground when the depot started using BukAm) and
-- corrects an adjustment's quantity in place, with a reason. Voiding stays
-- as it was.

-- ---------------------------------------------------------------------------
-- Correcting an adjustment's quantity
-- ---------------------------------------------------------------------------

create function public.correct_returnable_adjustment(
  p_adjustment_id uuid,
  p_quantity numeric,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_adjustment record;
  v_reason text;
  v_delta numeric;
  v_change numeric;
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
    raise exception 'This adjustment was voided, so it cannot be corrected.';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Enter a quantity greater than zero. To cancel the adjustment, void it instead.';
  end if;
  if p_quantity % 1 <> 0 and exists (
    select 1 from public.organizations o where o.id = v_adjustment.organization_id and o.sells_drinks
  ) then
    raise exception 'Empties are counted in whole numbers.';
  end if;

  -- The adjustment keeps its direction: an add stays an add.
  v_delta := sign(v_adjustment.quantity_delta) * p_quantity;
  v_change := v_delta - v_adjustment.quantity_delta;
  if v_change = 0 then
    raise exception 'That is already the quantity on this adjustment.';
  end if;

  -- Taking more out of the store than is there is never allowed.
  if v_change < 0 then
    perform 1 from public.returnable_items r where r.id = v_adjustment.returnable_item_id for update;
    v_holding := public.returnable_holding_at(v_adjustment.returnable_item_id, v_adjustment.location_id);
    if v_holding < -v_change then
      raise exception 'This correction takes % out of store, but only % are there now.',
        trim_scale(-v_change), trim_scale(v_holding);
    end if;
  end if;

  update public.returnable_adjustments a
  set quantity_delta = v_delta
  where a.id = p_adjustment_id;

  update public.returnable_movements m
  set holding_delta = v_delta,
      owed_delta = case when m.customer_id is null then 0 else -v_delta end
  where m.source_type = 'returnable_adjustment' and m.source_id = p_adjustment_id;

  perform public.write_audit_log(
    v_adjustment.organization_id, 'correct_returnable_adjustment', 'returnable_adjustments', p_adjustment_id,
    jsonb_build_object('quantity_delta', trim_scale(v_adjustment.quantity_delta), 'reason', v_adjustment.reason),
    jsonb_build_object('quantity_delta', trim_scale(v_delta), 'correction_reason', v_reason)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Setting the opening empties
-- ---------------------------------------------------------------------------

-- The first time, this records an "opening empties" adjustment. After that it
-- changes that same adjustment (its count and date), so there is only ever
-- one opening count per item and location.
create function public.set_opening_empties(
  p_organization_id uuid,
  p_location_id uuid,
  p_returnable_item_id uuid,
  p_quantity numeric,
  p_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing record;
begin
  perform public.require_org_role(p_organization_id, array['owner', 'admin']::public.member_role[]);
  perform public.assert_returnable_event(
    p_organization_id, p_location_id, p_returnable_item_id, p_date, p_quantity
  );

  select a.id, a.quantity_delta, a.adjustment_date
  into v_existing
  from public.returnable_adjustments a
  where a.organization_id = p_organization_id
    and a.location_id = p_location_id
    and a.returnable_item_id = p_returnable_item_id
    and a.reason = 'opening_count'
    and a.voided_at is null
  order by a.created_at
  limit 1
  for update;

  if not found then
    return public.record_returnable_adjustment(
      p_organization_id, p_location_id, p_date, p_returnable_item_id,
      'add', p_quantity, 'opening_count', null, 'Opening empties'
    );
  end if;

  if v_existing.quantity_delta <> p_quantity then
    perform public.correct_returnable_adjustment(
      v_existing.id, p_quantity, 'Opening empties set to ' || trim_scale(p_quantity)
    );
  end if;

  if v_existing.adjustment_date <> p_date then
    update public.returnable_adjustments a set adjustment_date = p_date where a.id = v_existing.id;
    update public.returnable_movements m
    set movement_date = p_date
    where m.source_type = 'returnable_adjustment' and m.source_id = v_existing.id;
  end if;

  return v_existing.id;
end;
$$;

revoke all on function public.correct_returnable_adjustment(uuid, numeric, text) from public, anon;
revoke all on function public.set_opening_empties(uuid, uuid, uuid, numeric, date) from public, anon;
grant execute on function public.correct_returnable_adjustment(uuid, numeric, text) to authenticated;
grant execute on function public.set_opening_empties(uuid, uuid, uuid, numeric, date) to authenticated;
