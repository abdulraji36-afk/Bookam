-- Stock summary, as in Bilikis: each product's total in and total out up to
-- the closing day, as well as its stock (in - out).

drop function public.stock_summary(uuid, date, uuid);

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
  total_in numeric,
  total_out numeric,
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
    coalesce(sum(m.qty_in), 0),
    coalesce(sum(m.qty_out), 0),
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

revoke all on function public.stock_summary(uuid, date, uuid) from public, anon;
grant execute on function public.stock_summary(uuid, date, uuid) to authenticated;
