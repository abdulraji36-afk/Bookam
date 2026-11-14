-- Iteration 8: what a business sells, and stock write-offs.
--
-- 1. Each business says whether customers bring things back and whether it
--    sells serial-numbered items. The app hides what a business does not use,
--    and the database refuses products that need a switched-off feature.
-- 2. Owners and admins can take stock out (damaged, expired, lost or stolen,
--    count wrong) or add found stock, with a reason. Each adjustment is a
--    ledger movement, so stock stays a sum of movements, and it can be voided.

-- ---------------------------------------------------------------------------
-- What a business sells
-- ---------------------------------------------------------------------------

alter table public.organizations
  add column tracks_returns boolean not null default true,
  add column tracks_serials boolean not null default false;

update public.organizations o
set tracks_serials = exists (
  select 1 from public.products p where p.organization_id = o.id and p.tracks_serials
);

drop function public.create_organization(text, text);

create function public.create_organization(
  p_name text,
  p_business_type text default null,
  p_tracks_returns boolean default true,
  p_tracks_serials boolean default false
)
returns table (id uuid, slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_base text;
  v_slug text;
  v_suffix integer := 1;
  v_org_id uuid;
begin
  if v_user_id is null then
    raise exception 'You must be logged in.' using errcode = '28000';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'Business name must be between 2 and 80 characters.';
  end if;

  v_base := btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'), '-');
  v_base := btrim(left(v_base, 40), '-');
  if v_base = '' then
    v_base := 'business';
  end if;

  loop
    v_slug := v_base || case when v_suffix = 1 then '' else '-' || v_suffix end;
    exit when not exists (select 1 from public.organizations o where o.slug = v_slug);
    v_suffix := v_suffix + 1;
  end loop;

  insert into public.organizations (
    name, slug, business_type, trial_ends_at, created_by, tracks_returns, tracks_serials
  )
  values (
    v_name,
    v_slug,
    nullif(left(btrim(coalesce(p_business_type, '')), 60), ''),
    now() + interval '14 days',
    v_user_id,
    coalesce(p_tracks_returns, true),
    coalesce(p_tracks_serials, false)
  )
  returning organizations.id into v_org_id;

  insert into public.locations (organization_id, name, is_default)
  values (v_org_id, 'Main', true);

  insert into public.memberships (organization_id, user_id, role)
  values (v_org_id, v_user_id, 'owner');

  perform public.write_audit_log(
    v_org_id, 'create_organization', 'organizations', v_org_id, null,
    jsonb_build_object(
      'name', v_name, 'slug', v_slug,
      'tracks_returns', coalesce(p_tracks_returns, true), 'tracks_serials', coalesce(p_tracks_serials, false)
    )
  );

  return query select v_org_id, v_slug;
end;
$$;

create function public.set_business_features(
  p_organization_id uuid,
  p_tracks_returns boolean,
  p_tracks_serials boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old record;
  v_name text;
begin
  perform public.require_org_role(p_organization_id, array['owner', 'admin']::public.member_role[]);

  select o.tracks_returns, o.tracks_serials into v_old
  from public.organizations o
  where o.id = p_organization_id
  for update;

  if not coalesce(p_tracks_returns, false) and v_old.tracks_returns then
    select p.name into v_name
    from public.products p
    where p.organization_id = p_organization_id and p.is_active and p.returnable_item_id is not null
    order by p.name
    limit 1;
    if v_name is not null then
      raise exception 'Returns cannot be switched off while % still needs something brought back. Change or switch off that product first.', v_name;
    end if;
    if exists (
      select 1 from public.customer_returnable_balances b
      where b.organization_id = p_organization_id
    ) then
      raise exception 'Returns cannot be switched off while customers still owe returnables or are in credit.';
    end if;
  end if;

  if not coalesce(p_tracks_serials, false) and v_old.tracks_serials then
    select p.name into v_name
    from public.products p
    where p.organization_id = p_organization_id and p.is_active and p.tracks_serials
    order by p.name
    limit 1;
    if v_name is not null then
      raise exception 'Serial numbers cannot be switched off while % is tracked by serial number. Change or switch off that product first.', v_name;
    end if;
  end if;

  update public.organizations o
  set tracks_returns = coalesce(p_tracks_returns, false),
      tracks_serials = coalesce(p_tracks_serials, false),
      updated_at = now()
  where o.id = p_organization_id;

  perform public.write_audit_log(
    p_organization_id, 'set_business_features', 'organizations', p_organization_id,
    jsonb_build_object('tracks_returns', v_old.tracks_returns, 'tracks_serials', v_old.tracks_serials),
    jsonb_build_object('tracks_returns', coalesce(p_tracks_returns, false), 'tracks_serials', coalesce(p_tracks_serials, false))
  );
end;
$$;

create or replace function public.save_product(
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
  p_warranty_months integer default null
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

  if v_product_id is null then
    insert into public.products (
      organization_id, name, sku, unit, selling_price, low_stock_threshold,
      returnable_item_id, tracks_serials, warranty_months, created_by
    )
    values (
      p_organization_id, v_name, v_sku, v_unit, p_selling_price, v_threshold,
      v_returnable_id, v_tracks, p_warranty_months, auth.uid()
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
      'tracks_serials', v_tracks, 'warranty_months', p_warranty_months
    )
  );

  return v_product_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Stock write-offs and corrections
-- ---------------------------------------------------------------------------

create type public.stock_adjustment_reason as enum (
  'damaged', 'expired', 'lost_or_stolen', 'count_correction', 'found'
);

create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null references public.locations (id),
  product_id uuid not null references public.products (id),
  adjustment_date date not null,
  -- Positive adds to stock, negative takes it out.
  quantity_delta numeric(14, 2) not null check (quantity_delta <> 0),
  reason public.stock_adjustment_reason not null,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  void_reason text
);

create index stock_adjustments_org_idx
  on public.stock_adjustments (organization_id, created_at desc);

-- A written-off unit points at the adjustment that took it out.
alter table public.product_units
  add column adjustment_id uuid references public.stock_adjustments (id);

alter table public.product_units drop constraint product_units_order_matches_status;
alter table public.product_units add constraint product_units_order_matches_status
  check ((status in ('reserved', 'sold')) = (order_id is not null));
alter table public.product_units add constraint product_units_written_off_has_adjustment
  check ((status = 'written_off') = (adjustment_id is not null));

alter table public.stock_adjustments enable row level security;
revoke all on public.stock_adjustments from anon, authenticated;
grant select on public.stock_adjustments to authenticated;

create policy "members read stock adjustments"
on public.stock_adjustments for select to authenticated
using (public.is_org_member(organization_id));

create function public.record_stock_adjustment(
  p_organization_id uuid,
  p_location_id uuid,
  p_adjustment_date date,
  p_product_id uuid,
  p_direction text,
  p_quantity numeric,
  p_reason public.stock_adjustment_reason,
  p_note text,
  p_unit_ids uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product record;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
  v_unit_ids uuid[] := coalesce(p_unit_ids, '{}'::uuid[]);
  v_quantity numeric;
  v_on_hand numeric;
  v_adjustment_id uuid;
begin
  perform public.require_org_role(p_organization_id, array['owner', 'admin']::public.member_role[]);

  if p_adjustment_date is null then
    raise exception 'Enter the date.';
  end if;
  if p_adjustment_date > public.org_today(p_organization_id) then
    raise exception 'The date cannot be in the future.';
  end if;

  if not exists (
    select 1 from public.locations l
    where l.id = p_location_id and l.organization_id = p_organization_id and l.is_active
  ) then
    raise exception 'Choose one of your locations.';
  end if;

  -- Locking the product serialises stock changes, as orders do.
  select p.id, p.name, p.tracks_serials
  into v_product
  from public.products p
  where p.id = p_product_id and p.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'Choose one of your products.';
  end if;

  if p_direction is null or p_direction not in ('add', 'subtract') then
    raise exception 'Choose whether to take stock out or add it.';
  end if;
  if p_reason is null then
    raise exception 'Choose a reason.';
  end if;
  if p_direction = 'subtract' and p_reason = 'found' then
    raise exception 'That reason does not go with taking stock out.';
  end if;
  if p_direction = 'add' and p_reason not in ('found', 'count_correction') then
    raise exception 'That reason does not go with adding stock.';
  end if;
  if p_reason = 'count_correction' and v_note is null then
    raise exception 'Add a note saying why the count is being corrected.';
  end if;

  if v_product.tracks_serials then
    if p_direction = 'add' then
      raise exception 'To add %, receive them as stock with their serial numbers.', v_product.name;
    end if;
    if cardinality(v_unit_ids) = 0 then
      raise exception 'Choose which % are being taken out, by serial number.', v_product.name;
    end if;
    if cardinality(v_unit_ids) <> (select count(distinct x) from unnest(v_unit_ids) x) then
      raise exception 'The same unit is chosen twice.';
    end if;

    perform 1 from public.product_units u where u.id = any (v_unit_ids) order by u.id for update;

    if (
      select count(*) from public.product_units u
      where u.id = any (v_unit_ids)
        and u.organization_id = p_organization_id
        and u.product_id = p_product_id
        and u.location_id = p_location_id
        and u.status = 'in_stock'
    ) <> cardinality(v_unit_ids) then
      raise exception 'One of the chosen units is not in stock at this location. Refresh and choose again.';
    end if;
    v_quantity := cardinality(v_unit_ids);
  else
    if cardinality(v_unit_ids) > 0 then
      raise exception '% is not tracked by serial number. Enter a quantity instead.', v_product.name;
    end if;
    if p_quantity is null or p_quantity <= 0 then
      raise exception 'Enter a quantity greater than zero.';
    end if;
    v_quantity := p_quantity;
  end if;

  if p_direction = 'subtract' then
    select coalesce(sum(m.qty_in - m.qty_out), 0) into v_on_hand
    from public.stock_movements m
    where m.product_id = p_product_id and m.location_id = p_location_id;

    if v_on_hand < v_quantity then
      raise exception 'Only % of % is in stock here, so % cannot be taken out.',
        trim_scale(v_on_hand), v_product.name, trim_scale(v_quantity);
    end if;
  end if;

  insert into public.stock_adjustments (
    organization_id, location_id, product_id, adjustment_date, quantity_delta, reason, note, created_by
  )
  values (
    p_organization_id, p_location_id, p_product_id, p_adjustment_date,
    case when p_direction = 'add' then v_quantity else -v_quantity end,
    p_reason, v_note, auth.uid()
  )
  returning stock_adjustments.id into v_adjustment_id;

  insert into public.stock_movements (
    organization_id, location_id, product_id, movement_type, qty_in, qty_out,
    source_type, source_id, movement_date, created_by
  )
  values (
    p_organization_id, p_location_id, p_product_id, 'adjustment',
    case when p_direction = 'add' then v_quantity else 0 end,
    case when p_direction = 'subtract' then v_quantity else 0 end,
    'stock_adjustment', v_adjustment_id, p_adjustment_date, auth.uid()
  );

  update public.product_units u
  set status = 'written_off', adjustment_id = v_adjustment_id
  where u.id = any (v_unit_ids);

  perform public.write_audit_log(
    p_organization_id, 'record_stock_adjustment', 'stock_adjustments', v_adjustment_id, null,
    jsonb_build_object(
      'name', v_product.name,
      'quantity_delta', case when p_direction = 'add' then v_quantity else -v_quantity end,
      'reason', p_reason, 'note', v_note,
      'serials', (select jsonb_agg(u.serial_no) from public.product_units u where u.id = any (v_unit_ids))
    )
  );

  return v_adjustment_id;
end;
$$;

create function public.void_stock_adjustment(p_adjustment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_adjustment record;
  v_reason text;
  v_on_hand numeric;
  v_serial text;
begin
  select a.id, a.organization_id, a.location_id, a.product_id, a.quantity_delta, a.reason, a.voided_at, p.name
  into v_adjustment
  from public.stock_adjustments a
  join public.products p on p.id = a.product_id
  where a.id = p_adjustment_id
  for update of a;

  if not found then
    raise exception 'Adjustment not found.';
  end if;

  perform public.require_org_role(v_adjustment.organization_id, array['owner', 'admin']::public.member_role[]);
  v_reason := public.require_reason(p_reason);

  if v_adjustment.voided_at is not null then
    raise exception 'This adjustment has already been voided.';
  end if;

  perform 1 from public.products p where p.id = v_adjustment.product_id for update;

  -- Undoing an addition takes the stock back out, so it must still be there.
  if v_adjustment.quantity_delta > 0 then
    select coalesce(sum(m.qty_in - m.qty_out), 0) into v_on_hand
    from public.stock_movements m
    where m.product_id = v_adjustment.product_id and m.location_id = v_adjustment.location_id;

    if v_on_hand < v_adjustment.quantity_delta then
      raise exception 'This adjustment cannot be voided: it added % of %, but only % are in stock now.',
        trim_scale(v_adjustment.quantity_delta), v_adjustment.name, trim_scale(v_on_hand);
    end if;
  end if;

  -- Written-off units come back, unless the same serial has been stocked since.
  select u.serial_no into v_serial
  from public.product_units u
  where u.adjustment_id = p_adjustment_id
    and exists (
      select 1 from public.product_units other
      where other.organization_id = u.organization_id
        and other.serial_no = u.serial_no
        and other.id <> u.id
        and other.status <> 'sold'
    )
  limit 1;
  if v_serial is not null then
    raise exception 'Serial number % has been stocked again since, so this adjustment cannot be voided.', v_serial;
  end if;

  update public.product_units u
  set status = 'in_stock', adjustment_id = null
  where u.adjustment_id = p_adjustment_id;

  delete from public.stock_movements m
  where m.source_type = 'stock_adjustment' and m.source_id = p_adjustment_id;

  update public.stock_adjustments a
  set voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
  where a.id = p_adjustment_id;

  perform public.write_audit_log(
    v_adjustment.organization_id, 'void_stock_adjustment', 'stock_adjustments', p_adjustment_id,
    jsonb_build_object('quantity_delta', v_adjustment.quantity_delta, 'reason', v_adjustment.reason),
    jsonb_build_object('name', v_adjustment.name, 'reason', v_reason)
  );
end;
$$;

-- The daily report shows adjustments in a column of their own.
drop function public.daily_stock_report(uuid, date);

create function public.daily_stock_report(p_organization_id uuid, p_date date)
returns table (
  product_id uuid,
  name text,
  unit text,
  opening numeric,
  received numeric,
  sold numeric,
  adjusted numeric,
  closing numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.name,
    p.unit,
    coalesce(sum(m.qty_in - m.qty_out) filter (where m.movement_date < p_date), 0),
    coalesce(sum(m.qty_in) filter (where m.movement_date = p_date and m.movement_type = 'stock_in'), 0),
    coalesce(sum(m.qty_out) filter (where m.movement_date = p_date and m.movement_type = 'sale'), 0),
    coalesce(sum(m.qty_in - m.qty_out) filter (where m.movement_date = p_date and m.movement_type = 'adjustment'), 0),
    coalesce(sum(m.qty_in - m.qty_out) filter (where m.movement_date <= p_date), 0)
  from public.products p
  left join public.stock_movements m on m.product_id = p.id
  where p.organization_id = p_organization_id
  group by p.id, p.name, p.unit, p.is_active
  having p.is_active or count(m.id) > 0
  order by p.name;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke all on function public.create_organization(text, text, boolean, boolean) from public, anon;
revoke all on function public.set_business_features(uuid, boolean, boolean) from public, anon;
revoke all on function public.record_stock_adjustment(uuid, uuid, date, uuid, text, numeric, public.stock_adjustment_reason, text, uuid[]) from public, anon;
revoke all on function public.void_stock_adjustment(uuid, text) from public, anon;
revoke all on function public.daily_stock_report(uuid, date) from public, anon;

grant execute on function public.create_organization(text, text, boolean, boolean) to authenticated;
grant execute on function public.set_business_features(uuid, boolean, boolean) to authenticated;
grant execute on function public.record_stock_adjustment(uuid, uuid, date, uuid, text, numeric, public.stock_adjustment_reason, text, uuid[]) to authenticated;
grant execute on function public.void_stock_adjustment(uuid, text) to authenticated;
grant execute on function public.daily_stock_report(uuid, date) to authenticated;
