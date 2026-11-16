-- Stock summary (as in Bilikis): everything in the depot at the close of a
-- chosen day, from the ledgers.
--
--   Stock of a product = sum(qty in) - sum(qty out), movements dated on or before the day
--   Empties in store   = opening + trip returns + follow-ups + adjustments - taken by the supplier
--
-- Both read with the caller's own access, so row level security keeps them
-- to the caller's businesses. A location narrows them to that location.

create function public.stock_summary(p_organization_id uuid, p_date date, p_location_id uuid default null)
returns table (
  product_id uuid,
  name text,
  sku text,
  unit text,
  category text,
  returnable boolean,
  low_stock_threshold numeric,
  tracks_serials boolean,
  in_stock numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.name,
    p.sku,
    p.unit,
    p.category,
    p.returnable_item_id is not null,
    p.low_stock_threshold,
    p.tracks_serials,
    coalesce(sum(m.qty_in - m.qty_out), 0)
  from public.products p
  left join public.stock_movements m
    on m.product_id = p.id
    and m.movement_date <= p_date
    and (p_location_id is null or m.location_id = p_location_id)
  where p.organization_id = p_organization_id
  group by p.id
  having p.is_active or coalesce(sum(m.qty_in - m.qty_out), 0) <> 0
  order by p.name;
$$;

create function public.empties_summary(p_organization_id uuid, p_date date, p_location_id uuid default null)
returns table (
  returnable_item_id uuid,
  name text,
  trip_returns numeric,
  followups numeric,
  taken_by_supplier numeric,
  adjustments numeric,
  in_store numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    r.id,
    r.name,
    -- What came back with trips, less any taken back out by a voided order.
    coalesce(sum(m.holding_delta) filter (
      where (m.movement_type = 'trip_return' and m.source_type <> 'empties_followup')
         or m.source_type = 'order_void'
    ), 0),
    coalesce(sum(m.holding_delta) filter (where m.source_type = 'empties_followup'), 0),
    coalesce(-sum(m.holding_delta) filter (where m.movement_type = 'supplier_exchange'), 0),
    coalesce(sum(m.holding_delta) filter (
      where m.movement_type = 'adjustment' and m.source_type <> 'order_void'
    ), 0),
    coalesce(sum(m.holding_delta), 0)
  from public.returnable_items r
  left join public.returnable_movements m
    on m.returnable_item_id = r.id
    and m.movement_date <= p_date
    and (p_location_id is null or m.location_id = p_location_id)
  where r.organization_id = p_organization_id
  group by r.id
  order by r.name;
$$;

revoke all on function public.stock_summary(uuid, date, uuid) from public, anon;
revoke all on function public.empties_summary(uuid, date, uuid) from public, anon;
grant execute on function public.stock_summary(uuid, date, uuid) to authenticated;
grant execute on function public.empties_summary(uuid, date, uuid) to authenticated;
