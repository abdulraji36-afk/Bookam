-- Normal businesses that count their goods run on the drinks depot workspace:
-- returnable goods work like RGB (they come back, with shortages per order,
-- follow-ups and a balance) and the rest like PET. Only the words differ.
--
-- organizations.sells_drinks now means "uses the depot workspace" (every rule
-- keyed on it applies to both); organizations.trade says whose words to use.
-- A goods depot names what comes back (e.g. "Empty cylinders"): that is the
-- name of its one returnable pool, as "Empties" is for drinks.

alter table public.organizations
  add column trade text not null default 'drinks' check (trade in ('drinks', 'goods'));

-- Drinks always tracks its empties; a goods depot may have nothing that comes back.
alter table public.organizations drop constraint organizations_drinks_track_returns;
alter table public.organizations
  add constraint organizations_drinks_track_returns
  check (not sells_drinks or tracks_returns or trade = 'goods');

comment on column public.organizations.sells_drinks is
  'Uses the depot workspace (orders by kind, trips, one returnable pool, shortages per order). trade says drinks or goods.';
comment on column public.organizations.trade is
  'Which words the depot workspace uses: drinks (RGB, PET, Empties) or goods (Returnable, Non-returnable, the pool''s own name).';

create function public.set_depot_trade(
  p_organization_id uuid,
  p_trade text,
  p_returnable_name text default null,
  p_has_returnables boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old record;
  v_name text := nullif(btrim(regexp_replace(coalesce(p_returnable_name, ''), '\s+', ' ', 'g')), '');
  v_pool uuid;
begin
  perform public.require_org_role(p_organization_id, array['owner', 'admin']::public.member_role[]);

  if p_trade not in ('drinks', 'goods') or p_trade is null then
    raise exception 'Choose drinks or goods.';
  end if;

  select o.trade, o.sells_drinks, o.tracks_returns into v_old
  from public.organizations o
  where o.id = p_organization_id
  for update;

  if not v_old.sells_drinks then
    raise exception 'This business does not use the depot workspace.';
  end if;

  if v_name is not null and char_length(v_name) > 40 then
    raise exception 'Use at most 40 characters for what comes back.';
  end if;
  v_name := coalesce(v_name, case when p_trade = 'drinks' then 'Empties' else 'Returnables' end);

  -- Nothing coming back any more: not while a product or a customer still needs it.
  if p_trade = 'goods' and not coalesce(p_has_returnables, true) and v_old.tracks_returns then
    if exists (
      select 1 from public.products p
      where p.organization_id = p_organization_id and p.is_active and p.returnable_item_id is not null
    ) then
      raise exception 'Returns cannot be switched off while a returnable product is in use. Change or switch off that product first.';
    end if;
    if exists (
      select 1 from public.customer_returnable_balances b
      where b.organization_id = p_organization_id and b.owed <> 0
    ) then
      raise exception 'Returns cannot be switched off while customers still owe some back.';
    end if;
  end if;

  update public.organizations o
  set trade = p_trade,
      -- Drinks always has empties; a goods depot may have nothing that comes back.
      tracks_returns = case when p_trade = 'drinks' then true else coalesce(p_has_returnables, true) end,
      updated_at = now()
  where o.id = p_organization_id;

  -- The one returnable pool takes the name.
  select r.id into v_pool
  from public.returnable_items r
  where r.organization_id = p_organization_id
  order by r.created_at
  limit 1;
  if v_pool is null then
    insert into public.returnable_items (organization_id, name) values (p_organization_id, v_name);
  else
    update public.returnable_items r set name = v_name where r.id = v_pool;
  end if;

  perform public.write_audit_log(
    p_organization_id, 'set_depot_trade', 'organizations', p_organization_id,
    jsonb_build_object('trade', v_old.trade, 'tracks_returns', v_old.tracks_returns),
    jsonb_build_object('trade', p_trade, 'returnable', v_name, 'tracks_returns', coalesce(p_has_returnables, true))
  );
end;
$$;

revoke all on function public.set_depot_trade(uuid, text, text, boolean) from public, anon;
grant execute on function public.set_depot_trade(uuid, text, text, boolean) to authenticated;
