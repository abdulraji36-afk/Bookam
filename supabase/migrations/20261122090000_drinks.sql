-- Iteration 10: drinks, the Bilikis way.
--
-- A drinks business has one pool of empties for the whole business, named
-- once ("Empties"). Each drink either comes in a crate whose empty must come
-- back (RGB) or not (PET, cans, juice, water). Like Bilikis:
--   * a drink cannot be saved without its selling price and buying cost;
--   * when the supplier delivers, the empties given back to them are recorded
--     on the same delivery, and only that many come off the empties in store;
--   * staff can record a customer bringing back empties they still owe.
-- Opening empties are an ordinary adjustment ("Opening count").

alter table public.organizations
  add column sells_drinks boolean not null default false;

-- Existing drinks depots.
update public.organizations o
set sells_drinks = true, tracks_returns = true
where o.business_type ilike '%drink%';

alter table public.organizations
  add constraint organizations_drinks_track_returns
  check (not sells_drinks or tracks_returns);

drop function public.create_organization(text, text, boolean, boolean, text, boolean);

create function public.create_organization(
  p_name text,
  p_business_type text default null,
  p_tracks_returns boolean default true,
  p_tracks_serials boolean default false,
  p_selling_mode text default 'quantity',
  p_does_delivery boolean default true,
  p_sells_drinks boolean default false
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
  v_mode text := coalesce(p_selling_mode, 'quantity');
  -- A shop that sells serial-numbered items always has serial numbers on.
  v_serials boolean := coalesce(p_tracks_serials, false) or coalesce(p_selling_mode, 'quantity') = 'serial';
  -- A drinks business always tracks its empties.
  v_drinks boolean := coalesce(p_sells_drinks, false);
  v_returns boolean := coalesce(p_tracks_returns, true) or coalesce(p_sells_drinks, false);
begin
  if v_user_id is null then
    raise exception 'You must be logged in.' using errcode = '28000';
  end if;

  if v_mode not in ('quantity', 'serial') then
    raise exception 'Choose how the business sells.';
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
    name, slug, business_type, trial_ends_at, created_by, tracks_returns, tracks_serials,
    selling_mode, does_delivery, sells_drinks
  )
  values (
    v_name,
    v_slug,
    nullif(left(btrim(coalesce(p_business_type, '')), 60), ''),
    now() + interval '14 days',
    v_user_id,
    v_returns,
    v_serials,
    v_mode,
    coalesce(p_does_delivery, true),
    v_drinks
  )
  returning organizations.id into v_org_id;

  insert into public.locations (organization_id, name, is_default)
  values (v_org_id, 'Main', true);

  insert into public.memberships (organization_id, user_id, role)
  values (v_org_id, v_user_id, 'owner');

  -- One pool of empties for the whole business, named once.
  if v_drinks then
    insert into public.returnable_items (organization_id, name) values (v_org_id, 'Empties');
  end if;

  perform public.write_audit_log(
    v_org_id, 'create_organization', 'organizations', v_org_id, null,
    jsonb_build_object(
      'name', v_name, 'slug', v_slug,
      'tracks_returns', v_returns, 'tracks_serials', v_serials,
      'selling_mode', v_mode, 'does_delivery', coalesce(p_does_delivery, true), 'sells_drinks', v_drinks
    )
  );

  return query select v_org_id, v_slug;
end;
$$;

drop function public.set_business_features(uuid, boolean, boolean, text, boolean);

create function public.set_business_features(
  p_organization_id uuid,
  p_tracks_returns boolean,
  p_tracks_serials boolean,
  p_selling_mode text default null,
  p_does_delivery boolean default null,
  p_sells_drinks boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old record;
  v_name text;
  v_mode text;
  v_serials boolean;
  v_delivery boolean;
  v_drinks boolean;
  v_returns boolean;
begin
  perform public.require_org_role(p_organization_id, array['owner', 'admin']::public.member_role[]);

  select o.tracks_returns, o.tracks_serials, o.selling_mode, o.does_delivery, o.sells_drinks into v_old
  from public.organizations o
  where o.id = p_organization_id
  for update;

  v_mode := coalesce(p_selling_mode, v_old.selling_mode);
  if v_mode not in ('quantity', 'serial') then
    raise exception 'Choose how the business sells.';
  end if;
  v_serials := coalesce(p_tracks_serials, false) or v_mode = 'serial';
  v_delivery := coalesce(p_does_delivery, v_old.does_delivery);
  v_drinks := coalesce(p_sells_drinks, v_old.sells_drinks);
  v_returns := coalesce(p_tracks_returns, false) or v_drinks;

  if not v_returns and v_old.tracks_returns then
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

  if not v_serials and v_old.tracks_serials then
    select p.name into v_name
    from public.products p
    where p.organization_id = p_organization_id and p.is_active and p.tracks_serials
    order by p.name
    limit 1;
    if v_name is not null then
      raise exception 'Serial numbers cannot be switched off while % is tracked by serial number. Change or switch off that product first.', v_name;
    end if;
  end if;

  -- Hiding Dispatch must not strand a trip that is loading or on the road.
  if not v_delivery and v_old.does_delivery and exists (
    select 1 from public.dispatch_trips t
    where t.organization_id = p_organization_id and t.status in ('draft', 'dispatched')
  ) then
    raise exception 'Delivery cannot be switched off while a trip is loading or on the road. Finish or cancel it first.';
  end if;

  update public.organizations o
  set tracks_returns = v_returns,
      sells_drinks = v_drinks,
      tracks_serials = v_serials,
      selling_mode = v_mode,
      does_delivery = v_delivery,
      updated_at = now()
  where o.id = p_organization_id;

  -- Starting to sell drinks: one pool of empties, unless one is already there.
  if v_drinks and not exists (
    select 1 from public.returnable_items r where r.organization_id = p_organization_id
  ) then
    insert into public.returnable_items (organization_id, name) values (p_organization_id, 'Empties');
  end if;

  perform public.write_audit_log(
    p_organization_id, 'set_business_features', 'organizations', p_organization_id,
    jsonb_build_object(
      'tracks_returns', v_old.tracks_returns, 'tracks_serials', v_old.tracks_serials,
      'selling_mode', v_old.selling_mode, 'does_delivery', v_old.does_delivery, 'sells_drinks', v_old.sells_drinks
    ),
    jsonb_build_object(
      'tracks_returns', v_returns, 'tracks_serials', v_serials,
      'selling_mode', v_mode, 'does_delivery', v_delivery, 'sells_drinks', v_drinks
    )
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
-- A supplier delivery that also takes empties away
-- ---------------------------------------------------------------------------

alter table public.supplier_exchanges
  add column receipt_id uuid unique references public.stock_receipts (id);

-- Records the goods received and, in the same go, the empties given to the
-- supplier. Either both are saved or neither is.
create function public.record_stock_delivery(
  p_organization_id uuid,
  p_location_id uuid,
  p_received_date date,
  p_supplier_name text,
  p_reference text,
  p_note text,
  p_items jsonb,
  p_empties_given numeric default 0,
  p_returnable_item_id uuid default null
)
returns table (id uuid, receipt_no text, exchange_no text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt_id uuid;
  v_receipt_no text;
  v_exchange_id uuid;
  v_exchange_no text;
begin
  perform public.require_org_role(p_organization_id, array['owner', 'admin', 'staff']::public.member_role[]);

  -- As in Bilikis, a drinks delivery carries the supplier's reference.
  if exists (select 1 from public.organizations o where o.id = p_organization_id and o.sells_drinks)
    and nullif(btrim(coalesce(p_reference, '')), '') is null then
    raise exception 'Enter the supplier''s delivery reference, such as the NBC delivery ref.';
  end if;

  if coalesce(p_empties_given, 0) < 0 then
    raise exception 'Empties given to the supplier cannot be less than zero.';
  end if;

  select r.id, r.receipt_no into v_receipt_id, v_receipt_no
  from public.record_stock_receipt(
    p_organization_id, p_location_id, p_received_date, p_supplier_name, p_reference, p_note, p_items
  ) r;

  if coalesce(p_empties_given, 0) > 0 then
    if p_returnable_item_id is null then
      raise exception 'Choose which empties were given to the supplier.';
    end if;

    -- The exchange checks there are enough empties in store.
    select e.id, e.exchange_no into v_exchange_id, v_exchange_no
    from public.record_supplier_exchange(
      p_organization_id, p_location_id, p_received_date, p_returnable_item_id, p_empties_given,
      p_supplier_name, p_reference, null, 'Given with delivery ' || v_receipt_no
    ) e;

    update public.supplier_exchanges e set receipt_id = v_receipt_id where e.id = v_exchange_id;
  end if;

  return query select v_receipt_id, v_receipt_no, v_exchange_no;
end;
$$;

-- Voiding a delivery also gives back the empties taken with it.
create function public.void_exchange_with_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.voided_at is not null and old.voided_at is null then
    delete from public.returnable_movements m
    using public.supplier_exchanges e
    where e.receipt_id = new.id
      and e.voided_at is null
      and m.source_type = 'supplier_exchange'
      and m.source_id = e.id;

    update public.supplier_exchanges e
    set voided_at = new.voided_at, voided_by = new.voided_by, void_reason = new.void_reason
    where e.receipt_id = new.id and e.voided_at is null;
  end if;
  return new;
end;
$$;

create trigger stock_receipts_void_exchange
after update of voided_at on public.stock_receipts
for each row execute function public.void_exchange_with_receipt();

-- ---------------------------------------------------------------------------
-- A customer brings back empties they owe (like a Bilikis follow-up return)
-- ---------------------------------------------------------------------------

create function public.record_customer_empties_return(
  p_organization_id uuid,
  p_location_id uuid,
  p_return_date date,
  p_returnable_item_id uuid,
  p_customer_id uuid,
  p_quantity numeric,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_customer text;
  v_owed numeric;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
  v_adjustment_id uuid;
begin
  perform public.require_org_role(p_organization_id, array['owner', 'admin', 'staff']::public.member_role[]);
  v_name := public.assert_returnable_event(
    p_organization_id, p_location_id, p_returnable_item_id, p_return_date, p_quantity
  );

  -- Locked so two people cannot both settle the same shortage.
  select c.name into v_customer
  from public.customers c
  where c.id = p_customer_id and c.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'Choose one of your customers.';
  end if;

  select coalesce(sum(m.owed_delta), 0) into v_owed
  from public.returnable_movements m
  where m.customer_id = p_customer_id and m.returnable_item_id = p_returnable_item_id;

  if p_quantity > v_owed then
    raise exception '% owes % %, so % cannot be recorded. If they brought back more, an owner or admin can add the extra as an adjustment.',
      v_customer, trim_scale(greatest(v_owed, 0)), v_name, trim_scale(p_quantity);
  end if;

  insert into public.returnable_adjustments (
    organization_id, location_id, adjustment_date, returnable_item_id, quantity_delta,
    reason, customer_id, note, created_by
  )
  values (
    p_organization_id, p_location_id, p_return_date, p_returnable_item_id, p_quantity,
    'customer_return', p_customer_id, v_note, auth.uid()
  )
  returning returnable_adjustments.id into v_adjustment_id;

  insert into public.returnable_movements (
    organization_id, returnable_item_id, location_id, customer_id, holding_delta, owed_delta,
    movement_type, source_type, source_id, movement_date, created_by
  )
  values (
    p_organization_id, p_returnable_item_id, p_location_id, p_customer_id, p_quantity, -p_quantity,
    'adjustment', 'returnable_adjustment', v_adjustment_id, p_return_date, auth.uid()
  );

  perform public.write_audit_log(
    p_organization_id, 'record_customer_empties_return', 'returnable_adjustments', v_adjustment_id, null,
    jsonb_build_object('returnable', v_name, 'customer', v_customer, 'quantity', p_quantity, 'note', v_note)
  );

  return v_adjustment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke all on function public.create_organization(text, text, boolean, boolean, text, boolean, boolean) from public, anon;
revoke all on function public.set_business_features(uuid, boolean, boolean, text, boolean, boolean) from public, anon;
revoke all on function public.record_stock_delivery(uuid, uuid, date, text, text, text, jsonb, numeric, uuid) from public, anon;
revoke all on function public.record_customer_empties_return(uuid, uuid, date, uuid, uuid, numeric, text) from public, anon;
revoke all on function public.void_exchange_with_receipt() from public, anon, authenticated;

grant execute on function public.create_organization(text, text, boolean, boolean, text, boolean, boolean) to authenticated;
grant execute on function public.set_business_features(uuid, boolean, boolean, text, boolean, boolean) to authenticated;
grant execute on function public.record_stock_delivery(uuid, uuid, date, text, text, text, jsonb, numeric, uuid) to authenticated;
grant execute on function public.record_customer_empties_return(uuid, uuid, date, uuid, uuid, numeric, text) to authenticated;
