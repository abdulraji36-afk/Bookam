-- Iteration 11: running a drinks depot day to day, as in Bilikis.
--
-- 1. Products get a category (RGB, PET, Juice, Energy, Can, Water for drinks),
--    for stock by category and stock value.
-- 2. A list of drivers and loaders to choose from for each trip, and the
--    loaders who went on each trip.

alter table public.products
  add column category text check (category is null or char_length(category) between 1 and 30);

-- Existing drinks: RGB where the empty comes back, PET otherwise.
update public.products p
set category = case when p.returnable_item_id is null then 'PET' else 'RGB' end
from public.organizations o
where o.id = p.organization_id and o.sells_drinks;

drop function public.save_product(uuid, uuid, text, text, text, numeric, numeric, numeric, boolean, text, boolean, integer);

create function public.save_product(
  p_organization_id uuid,
  p_product_id uuid,
  p_name text,
  p_sku text,
  p_unit text,
  p_selling_price numeric,
  p_cost_price numeric,
  p_low_stock_threshold numeric,
  p_requires_return boolean,
  p_return_item_name text,
  p_tracks_serials boolean default false,
  p_warranty_months integer default null,
  p_category text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_sku text := nullif(btrim(coalesce(p_sku, '')), '');
  v_unit text := btrim(coalesce(p_unit, ''));
  v_return_name text := btrim(coalesce(p_return_item_name, ''));
  v_threshold numeric := coalesce(p_low_stock_threshold, 0);
  v_tracks boolean := coalesce(p_tracks_serials, false);
  v_returnable_id uuid;
  -- In a drinks business an RGB drink is always in the RGB category.
  v_category text := nullif(left(btrim(coalesce(p_category, '')), 30), '');
  v_product_id uuid := p_product_id;
  v_old jsonb;
  v_on_hand numeric;
begin
  perform public.require_org_role(p_organization_id, array['owner', 'admin']::public.member_role[]);

  -- The business decides which kinds of selling it does.
  if coalesce(p_requires_return, false) and not exists (
    select 1 from public.organizations o where o.id = p_organization_id and o.tracks_returns
  ) then
    raise exception 'Returns are switched off for this business. Switch them on in Settings first.';
  end if;
  if v_tracks and not exists (
    select 1 from public.organizations o where o.id = p_organization_id and o.tracks_serials
  ) then
    raise exception 'Serial numbers are switched off for this business. Switch them on in Settings first.';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'Product name must be between 2 and 80 characters.';
  end if;
  if char_length(v_unit) < 1 or char_length(v_unit) > 30 then
    raise exception 'Enter the unit you sell this product in, such as crate or pack.';
  end if;
  if v_sku is not null and char_length(v_sku) > 40 then
    raise exception 'Product code must be 40 characters or fewer.';
  end if;
  -- Like Bilikis: a drink can only be sold once its price and cost are set,
  -- so neither can be left out.
  if exists (select 1 from public.organizations o where o.id = p_organization_id and o.sells_drinks)
    and (coalesce(p_selling_price, 0) <= 0 or coalesce(p_cost_price, 0) <= 0) then
    raise exception 'Enter the selling price and the buying cost. A drink cannot be saved without them.';
  end if;

  if p_selling_price < 0 or p_cost_price < 0 or v_threshold < 0 then
    raise exception 'Prices and the low stock level cannot be negative.';
  end if;
  if p_warranty_months is not null and (p_warranty_months < 1 or p_warranty_months > 120) then
    raise exception 'Warranty must be between 1 and 120 months.';
  end if;

  if v_product_id is not null then
    select to_jsonb(p) into v_old
    from public.products p
    where p.id = v_product_id and p.organization_id = p_organization_id
    for update;

    if v_old is null then
      raise exception 'Product not found.';
    end if;

    -- Stock already counted one way cannot suddenly be counted the other way.
    if (v_old ->> 'tracks_serials')::boolean is distinct from v_tracks then
      select coalesce(sum(m.qty_in - m.qty_out), 0) into v_on_hand
      from public.stock_movements m
      where m.product_id = v_product_id;

      if v_on_hand <> 0 or exists (
        select 1 from public.product_units u
        where u.product_id = v_product_id and u.status <> 'sold'
      ) then
        raise exception 'Serial numbers can only be switched % while % has no stock or open orders. It has % in stock now.',
          case when v_tracks then 'on' else 'off' end, v_name, trim_scale(v_on_hand);
      end if;
    end if;
  end if;

  if exists (
    select 1 from public.products p
    where p.organization_id = p_organization_id
      and lower(btrim(p.name)) = lower(v_name)
      and p.id is distinct from v_product_id
  ) then
    raise exception 'You already have a product called %.', v_name;
  end if;

  if v_sku is not null and exists (
    select 1 from public.products p
    where p.organization_id = p_organization_id
      and lower(btrim(p.sku)) = lower(v_sku)
      and p.id is distinct from v_product_id
  ) then
    raise exception 'Product code % is already used by another product.', v_sku;
  end if;

  if coalesce(p_requires_return, false) then
    if char_length(v_return_name) < 2 or char_length(v_return_name) > 60 then
      raise exception 'Say what the customer must bring back, such as Empty crate.';
    end if;

    select r.id into v_returnable_id
    from public.returnable_items r
    where r.organization_id = p_organization_id
      and lower(btrim(r.name)) = lower(v_return_name);

    if v_returnable_id is null then
      insert into public.returnable_items (organization_id, name)
      values (p_organization_id, v_return_name)
      returning returnable_items.id into v_returnable_id;
    end if;
  end if;

  if coalesce(p_requires_return, false) and exists (
    select 1 from public.organizations o where o.id = p_organization_id and o.sells_drinks
  ) then
    v_category := 'RGB';
  end if;

  if v_product_id is null then
    insert into public.products (
      organization_id, name, sku, unit, selling_price, low_stock_threshold,
      returnable_item_id, tracks_serials, warranty_months, category, created_by
    )
    values (
      p_organization_id, v_name, v_sku, v_unit, p_selling_price, v_threshold,
      v_returnable_id, v_tracks, p_warranty_months, v_category, auth.uid()
    )
    returning products.id into v_product_id;
  else
    update public.products p
    set name = v_name,
        sku = v_sku,
        unit = v_unit,
        selling_price = p_selling_price,
        low_stock_threshold = v_threshold,
        returnable_item_id = v_returnable_id,
        tracks_serials = v_tracks,
        warranty_months = p_warranty_months,
        category = v_category,
        updated_at = now()
    where p.id = v_product_id;
  end if;

  if p_cost_price is null then
    delete from public.product_costs c where c.product_id = v_product_id;
  else
    insert into public.product_costs as c (product_id, organization_id, cost_price)
    values (v_product_id, p_organization_id, p_cost_price)
    on conflict (product_id)
    do update set cost_price = excluded.cost_price, updated_at = now();
  end if;

  perform public.write_audit_log(
    p_organization_id,
    case when p_product_id is null then 'create_product' else 'update_product' end,
    'products', v_product_id, v_old,
    jsonb_build_object(
      'name', v_name, 'sku', v_sku, 'unit', v_unit, 'selling_price', p_selling_price,
      'cost_price', p_cost_price, 'low_stock_threshold', v_threshold,
      'returnable_item', nullif(v_return_name, ''),
      'tracks_serials', v_tracks, 'warranty_months', p_warranty_months, 'category', v_category
    )
  );

  return v_product_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Drivers and loaders
-- ---------------------------------------------------------------------------

create table public.dispatch_workers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  role text not null check (role in ('driver', 'loader')),
  phone text,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index dispatch_workers_org_role_name_key
  on public.dispatch_workers (organization_id, role, lower(btrim(name)));

alter table public.dispatch_workers enable row level security;
revoke all on public.dispatch_workers from anon, authenticated;
grant select on public.dispatch_workers to authenticated;

create policy "members read drivers and loaders"
on public.dispatch_workers for select to authenticated
using (public.is_org_member(organization_id));

-- The loaders who went out on a trip. The driver is on the trip itself.
create table public.dispatch_trip_loaders (
  trip_id uuid not null references public.dispatch_trips (id) on delete cascade,
  worker_id uuid not null references public.dispatch_workers (id),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  primary key (trip_id, worker_id)
);

alter table public.dispatch_trip_loaders enable row level security;
revoke all on public.dispatch_trip_loaders from anon, authenticated;
grant select on public.dispatch_trip_loaders to authenticated;

create policy "members read trip loaders"
on public.dispatch_trip_loaders for select to authenticated
using (public.is_org_member(organization_id));

create function public.save_dispatch_worker(
  p_organization_id uuid,
  p_worker_id uuid,
  p_name text,
  p_role text,
  p_phone text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := nullif(left(btrim(coalesce(p_phone, '')), 30), '');
  v_id uuid := p_worker_id;
  v_old jsonb;
begin
  perform public.require_org_role(p_organization_id, array['owner', 'admin']::public.member_role[]);

  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'Enter a name between 2 and 80 characters.';
  end if;
  if p_role is null or p_role not in ('driver', 'loader') then
    raise exception 'Choose whether this is a driver or a loader.';
  end if;

  if exists (
    select 1 from public.dispatch_workers w
    where w.organization_id = p_organization_id
      and w.role = p_role
      and lower(btrim(w.name)) = lower(v_name)
      and w.id is distinct from v_id
  ) then
    raise exception 'You already have a % called %.', p_role, v_name;
  end if;

  if v_id is null then
    insert into public.dispatch_workers (organization_id, name, role, phone, created_by)
    values (p_organization_id, v_name, p_role, v_phone, auth.uid())
    returning dispatch_workers.id into v_id;
  else
    select to_jsonb(w) into v_old
    from public.dispatch_workers w
    where w.id = v_id and w.organization_id = p_organization_id
    for update;
    if v_old is null then
      raise exception 'Driver or loader not found.';
    end if;
    update public.dispatch_workers w
    set name = v_name, role = p_role, phone = v_phone, updated_at = now()
    where w.id = v_id;
  end if;

  perform public.write_audit_log(
    p_organization_id,
    case when p_worker_id is null then 'create_dispatch_worker' else 'update_dispatch_worker' end,
    'dispatch_workers', v_id, v_old,
    jsonb_build_object('name', v_name, 'role', p_role, 'phone', v_phone)
  );
  return v_id;
end;
$$;

create function public.set_dispatch_worker_active(p_worker_id uuid, p_is_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker record;
begin
  select w.organization_id, w.name into v_worker
  from public.dispatch_workers w
  where w.id = p_worker_id
  for update;
  if not found then
    raise exception 'Driver or loader not found.';
  end if;
  perform public.require_org_role(v_worker.organization_id, array['owner', 'admin']::public.member_role[]);

  update public.dispatch_workers w
  set is_active = coalesce(p_is_active, false), updated_at = now()
  where w.id = p_worker_id;

  perform public.write_audit_log(
    v_worker.organization_id,
    case when coalesce(p_is_active, false) then 'activate_dispatch_worker' else 'deactivate_dispatch_worker' end,
    'dispatch_workers', p_worker_id, null, jsonb_build_object('name', v_worker.name)
  );
end;
$$;

-- Sets who loads a trip while it is still being put together.
create function public.set_trip_loaders(p_trip_id uuid, p_worker_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip record;
begin
  select t.organization_id, t.status into v_trip
  from public.dispatch_trips t
  where t.id = p_trip_id
  for update;
  if not found then
    raise exception 'Trip not found.';
  end if;
  perform public.require_org_role(v_trip.organization_id, array['owner', 'admin', 'staff']::public.member_role[]);
  if v_trip.status <> 'draft' then
    raise exception 'Loaders can only be changed before the trip is dispatched.';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_worker_ids, '{}'::uuid[])) as chosen(id)
    left join public.dispatch_workers w
      on w.id = chosen.id and w.organization_id = v_trip.organization_id and w.role = 'loader' and w.is_active
    where w.id is null
  ) then
    raise exception 'Choose loaders from your list.';
  end if;

  delete from public.dispatch_trip_loaders l where l.trip_id = p_trip_id;
  insert into public.dispatch_trip_loaders (trip_id, worker_id, organization_id)
  select distinct p_trip_id, chosen.id, v_trip.organization_id
  from unnest(coalesce(p_worker_ids, '{}'::uuid[])) as chosen(id);
end;
$$;

-- Creates the trip and records its loaders together.
create function public.create_dispatch_trip_with_crew(
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
-- Function privileges
-- ---------------------------------------------------------------------------

revoke all on function public.save_product(uuid, uuid, text, text, text, numeric, numeric, numeric, boolean, text, boolean, integer, text) from public, anon;
revoke all on function public.save_dispatch_worker(uuid, uuid, text, text, text) from public, anon;
revoke all on function public.set_dispatch_worker_active(uuid, boolean) from public, anon;
revoke all on function public.set_trip_loaders(uuid, uuid[]) from public, anon;
revoke all on function public.create_dispatch_trip_with_crew(uuid, uuid, date, text, text, text, uuid[], uuid[]) from public, anon;

grant execute on function public.save_product(uuid, uuid, text, text, text, numeric, numeric, numeric, boolean, text, boolean, integer, text) to authenticated;
grant execute on function public.save_dispatch_worker(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.set_dispatch_worker_active(uuid, boolean) to authenticated;
grant execute on function public.set_trip_loaders(uuid, uuid[]) to authenticated;
grant execute on function public.create_dispatch_trip_with_crew(uuid, uuid, date, text, text, text, uuid[], uuid[]) to authenticated;
