-- Drinks are sold to saved customers only: no walk-in buyers, for RGB or PET,
-- so every crate owed and every order has a name to follow up. Other
-- businesses (phone and goods shops) keep walk-in buyers.
--
-- The several-customer order screen goes back to customers only, and the
-- database refuses a drinks order without a customer. An order saved to a
-- walk-in before this can still be edited, as long as it stays as it was.

create function public.drinks_orders_need_a_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.customer_id is null
     and (tg_op = 'INSERT' or old.customer_id is not null)
     and exists (
       select 1 from public.organizations org
       where org.id = new.organization_id and org.sells_drinks
     )
  then
    raise exception 'Drinks are sold to saved customers only. Add the buyer as a customer first.';
  end if;
  return new;
end;
$$;

create trigger orders_drinks_need_a_customer
before insert or update of customer_id on public.orders
for each row execute function public.drinks_orders_need_a_customer();

revoke all on function public.drinks_orders_need_a_customer() from public, anon, authenticated;

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
    raise exception 'Add at least one customer.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_orders) as e(value)
    where jsonb_typeof(e.value -> 'items') is distinct from 'array'
      or jsonb_array_length(e.value -> 'items') = 0
  ) then
    raise exception 'Every customer needs at least one product.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_orders) as e(value)
    where nullif(e.value ->> 'customer_id', '') is null
  ) then
    raise exception 'Choose the customer on every card.';
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
      (e.value ->> 'customer_id')::uuid as customer_id,
      e.value -> 'items' as items
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
