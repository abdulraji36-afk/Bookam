-- Drinks orders are either RGB or PET, never both, so the orders page can
-- show them in two sections. A customer taking both gets two orders, which
-- can still go out on the same trip.
--
-- order_summaries also gains each order's empties: crates sent out, empties
-- brought back (with the trip and later), and what is left to complete.

create function public.drinks_order_one_kind()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rgb boolean := new.returnable_item_id is not null;
begin
  if exists (
    select 1
    from public.orders o
    join public.organizations org on org.id = o.organization_id and org.sells_drinks
    where o.id = new.order_id
  ) and exists (
    select 1
    from public.order_items i
    where i.order_id = new.order_id
      and (i.returnable_item_id is not null) <> v_rgb
  ) then
    raise exception 'An order is either RGB or PET. Put the % drinks on an order of their own.',
      case when v_rgb then 'RGB' else 'PET' end;
  end if;
  return null;
end;
$$;

-- After the whole insert, so every line of the order is seen.
create trigger order_items_drinks_one_kind
after insert on public.order_items
for each row execute function public.drinks_order_one_kind();

revoke all on function public.drinks_order_one_kind() from public, anon, authenticated;

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
  coalesce(c.name, o.buyer_name, 'Walk-in buyer') as customer_name,
  c.area as customer_area,
  coalesce(t.total_quantity, 0)::numeric(14, 2) as total_quantity,
  coalesce(t.total_amount, 0)::numeric(16, 2) as total_amount,
  coalesce(t.has_returns, false) as has_returns,
  dt.id as trip_id,
  dt.trip_no,
  o.created_at,
  o.voided_at,
  coalesce(c.phone, o.buyer_phone) as customer_phone,
  o.handed_over_at,
  -- Empties: sent out with the order, brought back so far, still to come.
  coalesce(t.returnable_quantity, 0)::numeric(14, 2) as returnable_quantity,
  r.brought_back::numeric(14, 2) as empties_returned,
  case
    when r.brought_back is not null then r.outstanding
    when o.status = 'dispatched' then coalesce(t.returnable_quantity, 0)
  end::numeric(14, 2) as empties_outstanding
from public.orders o
left join public.customers c on c.id = o.customer_id
left join lateral (
  select
    sum(i.quantity) as total_quantity,
    sum(i.line_total) as total_amount,
    bool_or(i.returnable_item_id is not null) as has_returns,
    sum(i.quantity) filter (where i.returnable_item_id is not null) as returnable_quantity
  from public.order_items i
  where i.order_id = o.id
) t on true
left join lateral (
  select
    sum(l.returned_quantity + coalesce(f.total, 0)) as brought_back,
    sum(greatest(l.expected_quantity - l.returned_quantity - coalesce(f.total, 0), 0)) as outstanding
  from public.trip_return_lines l
  left join lateral (
    select sum(f.quantity) as total
    from public.empties_followups f
    where f.trip_return_line_id = l.id and f.voided_at is null
  ) f on true
  where l.order_id = o.id
) r on true
left join public.dispatch_trip_orders dto on dto.order_id = o.id
left join public.dispatch_trips dt on dt.id = dto.trip_id;
