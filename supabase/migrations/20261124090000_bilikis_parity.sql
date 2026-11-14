-- Iteration 12: the remaining Bilikis rules, for drinks businesses.
--
-- 1. RGB crates and empties are whole numbers.
-- 2. Customers have a type (Retailer, Wholesaler, Distributor) and buy RGB,
--    PET or both; a drink of the other kind cannot be sold to them.
-- 3. A customer has at most one order with RGB crates waiting for dispatch;
--    edit that one instead of adding another.
-- 4. A void or correction needs a reason of at least 10 characters.
-- 5. Each delivery line keeps its buying cost, so stock is valued at the
--    average cost of what came in. Owners and admins can correct it.
-- 6. A drinks trip records its truck.

-- ---------------------------------------------------------------------------
-- 4. Reasons
-- ---------------------------------------------------------------------------

create or replace function public.require_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if char_length(v_reason) < 10 then
    raise exception 'Give a reason of at least 10 characters.';
  end if;
  return left(v_reason, 500);
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Whole numbers for RGB crates and empties
-- ---------------------------------------------------------------------------

create function public.drinks_whole_crates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if (new.qty_in % 1 <> 0 or new.qty_out % 1 <> 0) then
    select p.name into v_name
    from public.products p
    join public.organizations o on o.id = p.organization_id
    where p.id = new.product_id and p.returnable_item_id is not null and o.sells_drinks;
    if v_name is not null then
      raise exception 'RGB crates are counted in whole numbers. Check the quantity for %.', v_name;
    end if;
  end if;
  return new;
end;
$$;

create trigger stock_movements_whole_crates
before insert on public.stock_movements
for each row execute function public.drinks_whole_crates();

create function public.drinks_whole_empties()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.holding_delta % 1 <> 0 or new.owed_delta % 1 <> 0)
    and exists (select 1 from public.organizations o where o.id = new.organization_id and o.sells_drinks) then
    raise exception 'Empties are counted in whole numbers.';
  end if;
  return new;
end;
$$;

create trigger returnable_movements_whole_empties
before insert on public.returnable_movements
for each row execute function public.drinks_whole_empties();

-- ---------------------------------------------------------------------------
-- 2 and 3. Customers: type, what they buy, one waiting RGB order
-- ---------------------------------------------------------------------------

alter table public.customers
  add column customer_type text check (customer_type in ('Retailer', 'Wholesaler', 'Distributor')),
  add column buys text not null default 'both' check (buys in ('both', 'rgb', 'pet'));

create function public.drinks_order_line_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_product text;
  v_waiting text;
begin
  select o.id, o.customer_id, c.name as customer_name, c.buys
  into v_order
  from public.orders o
  join public.organizations org on org.id = o.organization_id and org.sells_drinks
  left join public.customers c on c.id = o.customer_id
  where o.id = new.order_id;

  if not found or v_order.customer_id is null then
    return new;
  end if;

  select p.name into v_product from public.products p where p.id = new.product_id;

  if new.returnable_item_id is not null and v_order.buys = 'pet' then
    raise exception '% buys PET only, so % (RGB) cannot be sold to them.', v_order.customer_name, v_product;
  end if;
  if new.returnable_item_id is null and v_order.buys = 'rgb' then
    raise exception '% buys RGB only, so % cannot be sold to them.', v_order.customer_name, v_product;
  end if;

  if new.returnable_item_id is not null then
    select o.order_no into v_waiting
    from public.orders o
    where o.customer_id = v_order.customer_id
      and o.id <> new.order_id
      and o.status = 'pending'
      and exists (
        select 1 from public.order_items i
        where i.order_id = o.id and i.returnable_item_id is not null
      )
    order by o.created_at
    limit 1;
    if v_waiting is not null then
      raise exception '% already has order % with RGB crates waiting for dispatch. Open and edit that order instead of adding another.',
        v_order.customer_name, v_waiting;
    end if;
  end if;

  return new;
end;
$$;

create trigger order_items_drinks_rules
before insert on public.order_items
for each row execute function public.drinks_order_line_rules();

drop function public.save_customer(uuid, uuid, text, text, text, text);

create function public.save_customer(
  p_organization_id uuid,
  p_customer_id uuid,
  p_name text,
  p_phone text,
  p_area text,
  p_address text,
  p_customer_type text default null,
  p_buys text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := nullif(left(btrim(coalesce(p_phone, '')), 30), '');
  v_area text := nullif(left(btrim(coalesce(p_area, '')), 80), '');
  v_address text := nullif(left(btrim(coalesce(p_address, '')), 200), '');
  v_customer_id uuid := p_customer_id;
  v_type text := nullif(btrim(coalesce(p_customer_type, '')), '');
  v_buys text := p_buys;
  v_old jsonb;
begin
  if v_customer_id is null then
    perform public.require_org_role(
      p_organization_id, array['owner', 'admin', 'staff']::public.member_role[]
    );
  else
    perform public.require_org_role(
      p_organization_id, array['owner', 'admin']::public.member_role[]
    );

    select to_jsonb(c) into v_old
    from public.customers c
    where c.id = v_customer_id and c.organization_id = p_organization_id
    for update;

    if v_old is null then
      raise exception 'Customer not found.';
    end if;
  end if;

  if v_type is not null and v_type not in ('Retailer', 'Wholesaler', 'Distributor') then
    raise exception 'Choose Retailer, Wholesaler or Distributor.';
  end if;
  -- Left out on an edit, what the customer buys stays as it was.
  if v_buys is null then
    v_buys := coalesce(v_old ->> 'buys', 'both');
  end if;
  if v_buys not in ('both', 'rgb', 'pet') then
    raise exception 'Choose whether the customer buys RGB, PET or both.';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'Customer name must be between 2 and 80 characters.';
  end if;

  if exists (
    select 1 from public.customers c
    where c.organization_id = p_organization_id
      and lower(btrim(c.name)) = lower(v_name)
      and lower(coalesce(btrim(c.area), '')) = lower(coalesce(v_area, ''))
      and c.id is distinct from v_customer_id
  ) then
    raise exception 'You already have a customer called % in that area.', v_name;
  end if;

  if v_customer_id is null then
    insert into public.customers (organization_id, name, phone, area, address, customer_type, buys, created_by)
    values (p_organization_id, v_name, v_phone, v_area, v_address, v_type, v_buys, auth.uid())
    returning customers.id into v_customer_id;
  else
    update public.customers c
    set name = v_name, phone = v_phone, area = v_area, address = v_address,
        customer_type = coalesce(v_type, c.customer_type), buys = v_buys, updated_at = now()
    where c.id = v_customer_id;
  end if;

  perform public.write_audit_log(
    p_organization_id,
    case when p_customer_id is null then 'create_customer' else 'update_customer' end,
    'customers', v_customer_id, v_old,
    jsonb_build_object(
      'name', v_name, 'phone', v_phone, 'area', v_area, 'address', v_address,
      'customer_type', v_type, 'buys', v_buys
    )
  );

  return v_customer_id;
end;
$$;

create or replace function public.create_dispatch_trip_with_crew(
  p_organization_id uuid,
  p_location_id uuid,
  p_dispatch_date date,
  p_driver_name text,
  p_vehicle text,
  p_note text,
  p_order_ids uuid[],
  p_loader_ids uuid[] default '{}'
)
returns table (id uuid, trip_no text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip_id uuid;
  v_trip_no text;
begin
  -- As in Bilikis, a drinks trip records the truck it went out on.
  if exists (select 1 from public.organizations o where o.id = p_organization_id and o.sells_drinks)
    and nullif(btrim(coalesce(p_vehicle, '')), '') is null then
    raise exception 'Enter the truck for this trip.';
  end if;

  select t.id, t.trip_no into v_trip_id, v_trip_no
  from public.create_dispatch_trip(
    p_organization_id, p_location_id, p_dispatch_date, p_driver_name, p_vehicle, p_note, p_order_ids
  ) t;

  if cardinality(coalesce(p_loader_ids, '{}'::uuid[])) > 0 then
    perform public.set_trip_loaders(v_trip_id, p_loader_ids);
  end if;

  return query select v_trip_id, v_trip_no;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. The buying cost of each delivery line
-- ---------------------------------------------------------------------------

-- Kept apart from the delivery line itself so that, like product costs, only
-- owners and admins can read it.
create table public.stock_receipt_item_costs (
  receipt_item_id uuid primary key references public.stock_receipt_items (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  unit_cost numeric(14, 2) not null check (unit_cost >= 0),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.stock_receipt_item_costs enable row level security;
revoke all on public.stock_receipt_item_costs from anon, authenticated;
grant select on public.stock_receipt_item_costs to authenticated;

create policy "admins read delivery costs"
on public.stock_receipt_item_costs for select to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));

-- Each new delivery line takes the product's buying cost at that moment.
create function public.copy_cost_to_receipt_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.stock_receipt_item_costs (receipt_item_id, organization_id, unit_cost, updated_by)
  select new.id, new.organization_id, c.cost_price, auth.uid()
  from public.product_costs c
  where c.product_id = new.product_id;
  return new;
end;
$$;

create trigger stock_receipt_items_copy_cost
after insert on public.stock_receipt_items
for each row execute function public.copy_cost_to_receipt_item();

-- Deliveries from before this change take the product's current cost.
insert into public.stock_receipt_item_costs (receipt_item_id, organization_id, unit_cost)
select i.id, i.organization_id, c.cost_price
from public.stock_receipt_items i
join public.product_costs c on c.product_id = i.product_id
on conflict do nothing;

create function public.set_receipt_item_cost(p_receipt_item_id uuid, p_unit_cost numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_old numeric;
begin
  select i.id, i.organization_id, r.receipt_no, p.name
  into v_item
  from public.stock_receipt_items i
  join public.stock_receipts r on r.id = i.receipt_id
  join public.products p on p.id = i.product_id
  where i.id = p_receipt_item_id;
  if not found then
    raise exception 'Delivery line not found.';
  end if;
  perform public.require_org_role(v_item.organization_id, array['owner', 'admin']::public.member_role[]);

  if p_unit_cost is null or p_unit_cost < 0 then
    raise exception 'Buying cost must be zero or greater.';
  end if;

  select c.unit_cost into v_old from public.stock_receipt_item_costs c where c.receipt_item_id = p_receipt_item_id;

  insert into public.stock_receipt_item_costs as c (receipt_item_id, organization_id, unit_cost, updated_by)
  values (p_receipt_item_id, v_item.organization_id, p_unit_cost, auth.uid())
  on conflict (receipt_item_id)
  do update set unit_cost = excluded.unit_cost, updated_by = excluded.updated_by, updated_at = now();

  perform public.write_audit_log(
    v_item.organization_id, 'set_receipt_item_cost', 'stock_receipt_items', p_receipt_item_id,
    jsonb_build_object('unit_cost', v_old),
    jsonb_build_object('receipt_no', v_item.receipt_no, 'product', v_item.name, 'unit_cost', p_unit_cost)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke all on function public.drinks_whole_crates() from public, anon, authenticated;
revoke all on function public.drinks_whole_empties() from public, anon, authenticated;
revoke all on function public.drinks_order_line_rules() from public, anon, authenticated;
revoke all on function public.copy_cost_to_receipt_item() from public, anon, authenticated;
revoke all on function public.save_customer(uuid, uuid, text, text, text, text, text, text) from public, anon;
revoke all on function public.set_receipt_item_cost(uuid, numeric) from public, anon;

grant execute on function public.save_customer(uuid, uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.set_receipt_item_cost(uuid, numeric) to authenticated;
