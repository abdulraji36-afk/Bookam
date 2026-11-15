-- The several-customer order screen takes walk-in buyers too. A walk-in row
-- has no saved customer: it carries the buyer's name and phone on the order
-- (for warranty), and may be handed over at the counter straight away.
--
-- Each element of p_orders is
--   { customer_id | null, buyer_name, buyer_phone, handed_over, items: [...] }
-- A saved customer can be on the list only once; walk-ins can be as many as
-- needed. Drinks that must be brought back are refused for a walk-in by
-- create_order, as before.

create or replace function public.create_order_batch(
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
    raise exception 'Add at least one customer or walk-in buyer.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_orders) as e(value)
    where jsonb_typeof(e.value -> 'items') is distinct from 'array'
      or jsonb_array_length(e.value -> 'items') = 0
  ) then
    raise exception 'Every customer and walk-in buyer needs at least one product.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_orders) as e(value)
    where nullif(e.value ->> 'customer_id', '') is null
      and nullif(btrim(coalesce(e.value ->> 'buyer_name', '')), '') is null
  ) then
    raise exception 'Enter the name of each walk-in buyer.';
  end if;

  select c.name into v_name
  from jsonb_array_elements(p_orders) as e(value)
  join public.customers c on c.id = nullif(e.value ->> 'customer_id', '')::uuid
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
    from jsonb_array_elements(p_orders) as e(value)
    cross join lateral jsonb_array_elements(e.value -> 'items') as i
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
    select
      nullif(e.value ->> 'customer_id', '')::uuid as customer_id,
      e.value ->> 'buyer_name' as buyer_name,
      e.value ->> 'buyer_phone' as buyer_phone,
      coalesce((e.value ->> 'handed_over')::boolean, false) as handed_over,
      e.value -> 'items' as items
    from jsonb_array_elements(p_orders) with ordinality as e(value, position)
    order by e.position
  loop
    return query
    select created.id, created.order_no
    from public.create_order(
      p_organization_id, p_location_id, p_order_date, v_order.customer_id,
      p_payment_type, p_note, v_order.items,
      -- Only a walk-in is handed over at the counter; a customer's order waits for dispatch.
      v_order.handed_over and v_order.customer_id is null,
      v_order.buyer_name, v_order.buyer_phone
    ) as created;
  end loop;
end;
$$;
