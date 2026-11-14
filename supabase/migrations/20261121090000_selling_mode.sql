-- Iteration 9: two kinds of business.
--
-- A business either counts its goods (crates, bags, cartons) or sells items
-- one by one with serial numbers (phones, laptops). This "selling mode"
-- shapes what the app shows: the words, the menu and the defaults. A serial
-- shop can still sell accessories by quantity; each product decides.
--
-- Delivery is a separate choice, because some shops of either kind deliver
-- and some only sell at the counter. When it is off, Dispatch is hidden.

alter table public.organizations
  add column selling_mode text not null default 'quantity'
    check (selling_mode in ('quantity', 'serial')),
  add column does_delivery boolean not null default true;

-- Existing businesses: serial mode where most active products have serials.
update public.organizations o
set selling_mode = 'serial'
where o.tracks_serials
  and (
    select count(*) filter (where p.tracks_serials) * 2 >= count(*)
    from public.products p
    where p.organization_id = o.id and p.is_active
  );

-- A serial-mode business that has never used Dispatch starts with delivery off.
update public.organizations o
set does_delivery = false
where o.selling_mode = 'serial'
  and not exists (select 1 from public.dispatch_trips t where t.organization_id = o.id);

alter table public.organizations
  add constraint organizations_serial_mode_has_serials
  check (selling_mode <> 'serial' or tracks_serials);

drop function public.create_organization(text, text, boolean, boolean);

create function public.create_organization(
  p_name text,
  p_business_type text default null,
  p_tracks_returns boolean default true,
  p_tracks_serials boolean default false,
  p_selling_mode text default 'quantity',
  p_does_delivery boolean default true
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
    selling_mode, does_delivery
  )
  values (
    v_name,
    v_slug,
    nullif(left(btrim(coalesce(p_business_type, '')), 60), ''),
    now() + interval '14 days',
    v_user_id,
    coalesce(p_tracks_returns, true),
    v_serials,
    v_mode,
    coalesce(p_does_delivery, true)
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
      'tracks_returns', coalesce(p_tracks_returns, true), 'tracks_serials', v_serials,
      'selling_mode', v_mode, 'does_delivery', coalesce(p_does_delivery, true)
    )
  );

  return query select v_org_id, v_slug;
end;
$$;

-- Also takes the selling mode and delivery. Left out (null), they keep their
-- current value, so the three-argument call still works.
drop function public.set_business_features(uuid, boolean, boolean);

create function public.set_business_features(
  p_organization_id uuid,
  p_tracks_returns boolean,
  p_tracks_serials boolean,
  p_selling_mode text default null,
  p_does_delivery boolean default null
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
begin
  perform public.require_org_role(p_organization_id, array['owner', 'admin']::public.member_role[]);

  select o.tracks_returns, o.tracks_serials, o.selling_mode, o.does_delivery into v_old
  from public.organizations o
  where o.id = p_organization_id
  for update;

  v_mode := coalesce(p_selling_mode, v_old.selling_mode);
  if v_mode not in ('quantity', 'serial') then
    raise exception 'Choose how the business sells.';
  end if;
  v_serials := coalesce(p_tracks_serials, false) or v_mode = 'serial';
  v_delivery := coalesce(p_does_delivery, v_old.does_delivery);

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
  set tracks_returns = coalesce(p_tracks_returns, false),
      tracks_serials = v_serials,
      selling_mode = v_mode,
      does_delivery = v_delivery,
      updated_at = now()
  where o.id = p_organization_id;

  perform public.write_audit_log(
    p_organization_id, 'set_business_features', 'organizations', p_organization_id,
    jsonb_build_object(
      'tracks_returns', v_old.tracks_returns, 'tracks_serials', v_old.tracks_serials,
      'selling_mode', v_old.selling_mode, 'does_delivery', v_old.does_delivery
    ),
    jsonb_build_object(
      'tracks_returns', coalesce(p_tracks_returns, false), 'tracks_serials', v_serials,
      'selling_mode', v_mode, 'does_delivery', v_delivery
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke all on function public.create_organization(text, text, boolean, boolean, text, boolean) from public, anon;
revoke all on function public.set_business_features(uuid, boolean, boolean, text, boolean) from public, anon;
grant execute on function public.create_organization(text, text, boolean, boolean, text, boolean) to authenticated;
grant execute on function public.set_business_features(uuid, boolean, boolean, text, boolean) to authenticated;
