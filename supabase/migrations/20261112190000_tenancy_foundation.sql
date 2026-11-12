-- Iteration 1: businesses (organizations), team membership, invitations,
-- plans and limits, audit log, and tenant-scoped row level security.
--
-- Rules this file establishes for every later migration:
--   * Every business-owned table carries organization_id.
--   * Clients can only SELECT, and only rows of businesses they belong to.
--   * Every write goes through a SECURITY DEFINER function that checks the
--     caller's membership and writes its own audit row in the same transaction.

-- ---------------------------------------------------------------------------
-- Types and tables
-- ---------------------------------------------------------------------------

create type public.member_role as enum ('owner', 'admin', 'staff');

create table public.plans (
  code text primary key,
  name text not null,
  -- null means unlimited
  max_members integer check (max_members > 0),
  max_locations integer check (max_locations > 0),
  sort_order integer not null default 0
);

insert into public.plans (code, name, max_members, max_locations, sort_order)
values
  ('trial', 'Free trial', null, null, 0),
  ('starter', 'Starter', 3, 1, 1),
  ('growth', 'Growth', 10, 2, 2),
  ('business', 'Business', null, null, 3);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text,
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  business_type text,
  country_code text not null default 'NG' check (country_code ~ '^[A-Z]{2}$'),
  currency_code text not null default 'NGN' check (currency_code ~ '^[A-Z]{3}$'),
  timezone text not null default 'Africa/Lagos',
  plan_code text not null default 'trial' references public.plans (code),
  trial_ends_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index locations_org_name_key
  on public.locations (organization_id, lower(btrim(name)));
create unique index locations_one_default_per_org
  on public.locations (organization_id) where is_default;

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index memberships_user_idx on public.memberships (user_id, organization_id);
create unique index memberships_one_owner_per_org
  on public.memberships (organization_id) where role = 'owner';

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(btrim(email))),
  role public.member_role not null check (role <> 'owner'),
  -- Only the SHA-256 of the invite token is stored; the link is shown once.
  token_hash text not null unique,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz
);

create unique index invitations_one_open_per_email
  on public.invitations (organization_id, email)
  where accepted_at is null and revoked_at is null;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_org_created_idx
  on public.audit_logs (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Profile sync from Supabase Auth
-- ---------------------------------------------------------------------------

create function public.handle_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    lower(new.email),
    left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120)
  )
  on conflict (id) do update set email = excluded.email;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_auth_user_change();

create trigger on_auth_user_email_changed
after update of email on auth.users
for each row execute function public.handle_auth_user_change();

-- ---------------------------------------------------------------------------
-- Membership helpers (used by policies and by every write function)
-- ---------------------------------------------------------------------------

create function public.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
  );
$$;

create function public.has_org_role(
  p_organization_id uuid,
  p_roles public.member_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role = any (p_roles)
  );
$$;

create function public.shares_org_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs
      on theirs.organization_id = mine.organization_id
    where mine.user_id = (select auth.uid())
      and mine.is_active
      and theirs.user_id = p_user_id
  );
$$;

-- Returns the caller's role in the business, or raises.
create function public.require_org_role(
  p_organization_id uuid,
  p_roles public.member_role[]
)
returns public.member_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.member_role;
begin
  if v_user_id is null then
    raise exception 'You must be logged in.' using errcode = '28000';
  end if;

  select m.role
  into v_role
  from public.memberships m
  where m.organization_id = p_organization_id
    and m.user_id = v_user_id
    and m.is_active;

  if v_role is null or not (v_role = any (p_roles)) then
    raise exception 'You do not have permission to do this.' using errcode = '42501';
  end if;

  return v_role;
end;
$$;

create function public.write_audit_log(
  p_organization_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_old_values jsonb default null,
  p_new_values jsonb default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (
    organization_id, user_id, action, entity_type, entity_id, old_values, new_values
  )
  values (
    p_organization_id, auth.uid(), p_action, p_entity_type, p_entity_id,
    p_old_values, p_new_values
  );
$$;

-- Seats in use: active members plus invitations that can still be accepted.
create function public.assert_member_seat_available(
  p_organization_id uuid,
  p_ignore_email text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max integer;
  v_used integer;
begin
  -- Serialises concurrent invites for the same business.
  select p.max_members
  into v_max
  from public.organizations o
  join public.plans p on p.code = o.plan_code
  where o.id = p_organization_id
  for update of o;

  if v_max is null then
    return;
  end if;

  select
    (select count(*) from public.memberships m
      where m.organization_id = p_organization_id and m.is_active)
    +
    (select count(*) from public.invitations i
      where i.organization_id = p_organization_id
        and i.accepted_at is null
        and i.revoked_at is null
        and i.expires_at > now()
        and (p_ignore_email is null or i.email <> p_ignore_email))
  into v_used;

  if v_used >= v_max then
    raise exception 'Your plan allows up to % team members. Upgrade to add more.', v_max
      using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Write functions
-- ---------------------------------------------------------------------------

create function public.create_organization(
  p_name text,
  p_business_type text default null
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

  insert into public.organizations (name, slug, business_type, trial_ends_at, created_by)
  values (
    v_name,
    v_slug,
    nullif(left(btrim(coalesce(p_business_type, '')), 60), ''),
    now() + interval '14 days',
    v_user_id
  )
  returning organizations.id into v_org_id;

  insert into public.locations (organization_id, name, is_default)
  values (v_org_id, 'Main', true);

  insert into public.memberships (organization_id, user_id, role)
  values (v_org_id, v_user_id, 'owner');

  perform public.write_audit_log(
    v_org_id, 'create_organization', 'organizations', v_org_id, null,
    jsonb_build_object('name', v_name, 'slug', v_slug)
  );

  return query select v_org_id, v_slug;
end;
$$;

create function public.update_organization(
  p_organization_id uuid,
  p_name text,
  p_business_type text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_type text := nullif(left(btrim(coalesce(p_business_type, '')), 60), '');
  v_old record;
begin
  perform public.require_org_role(p_organization_id, array['owner', 'admin']::public.member_role[]);

  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'Business name must be between 2 and 80 characters.';
  end if;

  select o.name, o.business_type
  into v_old
  from public.organizations o
  where o.id = p_organization_id
  for update;

  update public.organizations o
  set name = v_name, business_type = v_type, updated_at = now()
  where o.id = p_organization_id;

  perform public.write_audit_log(
    p_organization_id, 'update_organization', 'organizations', p_organization_id,
    jsonb_build_object('name', v_old.name, 'business_type', v_old.business_type),
    jsonb_build_object('name', v_name, 'business_type', v_type)
  );
end;
$$;

create function public.create_location(
  p_organization_id uuid,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_max integer;
  v_used integer;
  v_location_id uuid;
begin
  perform public.require_org_role(p_organization_id, array['owner', 'admin']::public.member_role[]);

  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'Location name must be between 2 and 80 characters.';
  end if;

  select p.max_locations
  into v_max
  from public.organizations o
  join public.plans p on p.code = o.plan_code
  where o.id = p_organization_id
  for update of o;

  select count(*)
  into v_used
  from public.locations l
  where l.organization_id = p_organization_id and l.is_active;

  if v_max is not null and v_used >= v_max then
    raise exception 'Your plan allows up to % location(s). Upgrade to add more.', v_max;
  end if;

  if exists (
    select 1 from public.locations l
    where l.organization_id = p_organization_id
      and lower(btrim(l.name)) = lower(v_name)
  ) then
    raise exception 'A location with this name already exists.';
  end if;

  insert into public.locations (organization_id, name)
  values (p_organization_id, v_name)
  returning locations.id into v_location_id;

  perform public.write_audit_log(
    p_organization_id, 'create_location', 'locations', v_location_id, null,
    jsonb_build_object('name', v_name)
  );

  return v_location_id;
end;
$$;

create function public.invite_member(
  p_organization_id uuid,
  p_email text,
  p_role public.member_role
)
returns table (invitation_id uuid, token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role public.member_role;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_token text;
  v_invitation_id uuid;
begin
  v_caller_role := public.require_org_role(
    p_organization_id, array['owner', 'admin']::public.member_role[]
  );

  if p_role is null or p_role = 'owner' then
    raise exception 'Choose Admin or Staff for the new team member.';
  end if;

  if p_role = 'admin' and v_caller_role <> 'owner' then
    raise exception 'Only the owner can invite an admin.';
  end if;

  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'Enter a valid email address.';
  end if;

  if exists (
    select 1
    from public.memberships m
    join public.profiles p on p.id = m.user_id
    where m.organization_id = p_organization_id
      and p.email = v_email
  ) then
    raise exception 'This person is already on your team.';
  end if;

  perform public.assert_member_seat_available(p_organization_id, v_email);

  -- A new invite replaces any earlier open invite to the same address.
  update public.invitations i
  set revoked_at = now()
  where i.organization_id = p_organization_id
    and i.email = v_email
    and i.accepted_at is null
    and i.revoked_at is null;

  v_token := replace(gen_random_uuid()::text, '-', '')
          || replace(gen_random_uuid()::text, '-', '');

  insert into public.invitations (organization_id, email, role, token_hash, invited_by)
  values (
    p_organization_id,
    v_email,
    p_role,
    encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
    auth.uid()
  )
  returning invitations.id into v_invitation_id;

  perform public.write_audit_log(
    p_organization_id, 'invite_member', 'invitations', v_invitation_id, null,
    jsonb_build_object('email', v_email, 'role', p_role)
  );

  return query select v_invitation_id, v_token;
end;
$$;

create function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation record;
begin
  select i.id, i.organization_id, i.email, i.accepted_at, i.revoked_at
  into v_invitation
  from public.invitations i
  where i.id = p_invitation_id
  for update;

  if not found then
    raise exception 'Invitation not found.';
  end if;

  perform public.require_org_role(
    v_invitation.organization_id, array['owner', 'admin']::public.member_role[]
  );

  if v_invitation.accepted_at is not null then
    raise exception 'This invitation has already been accepted.';
  end if;

  if v_invitation.revoked_at is not null then
    return;
  end if;

  update public.invitations i
  set revoked_at = now()
  where i.id = p_invitation_id;

  perform public.write_audit_log(
    v_invitation.organization_id, 'revoke_invitation', 'invitations', p_invitation_id,
    null, jsonb_build_object('email', v_invitation.email)
  );
end;
$$;

-- Lets the invite page show who is inviting, before the visitor has an account.
-- The token itself is the secret; nothing is returned for an unknown token.
create function public.get_invitation_preview(p_token text)
returns table (
  organization_name text,
  email text,
  role public.member_role,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.name,
    i.email,
    i.role,
    case
      when i.accepted_at is not null then 'accepted'
      when i.revoked_at is not null then 'revoked'
      when i.expires_at <= now() then 'expired'
      else 'pending'
    end
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  where i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

create function public.accept_invitation(p_token text)
returns table (organization_id uuid, slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_invitation record;
  v_membership_id uuid;
begin
  if v_user_id is null then
    raise exception 'You must be logged in.' using errcode = '28000';
  end if;

  select lower(u.email)
  into v_user_email
  from auth.users u
  where u.id = v_user_id;

  select i.*
  into v_invitation
  from public.invitations i
  where i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
  for update;

  if not found then
    raise exception 'This invitation link is not valid.';
  end if;

  if v_invitation.accepted_at is not null then
    raise exception 'This invitation has already been used.';
  end if;

  if v_invitation.revoked_at is not null then
    raise exception 'This invitation was cancelled. Ask for a new one.';
  end if;

  if v_invitation.expires_at <= now() then
    raise exception 'This invitation has expired. Ask for a new one.';
  end if;

  if v_user_email is distinct from v_invitation.email then
    raise exception 'This invitation was sent to a different email address.';
  end if;

  insert into public.memberships as m (organization_id, user_id, role)
  values (v_invitation.organization_id, v_user_id, v_invitation.role)
  on conflict on constraint memberships_organization_id_user_id_key
  do update set role = excluded.role, is_active = true, updated_at = now()
    where m.role <> 'owner'
  returning m.id into v_membership_id;

  update public.invitations i
  set accepted_at = now(), accepted_by = v_user_id
  where i.id = v_invitation.id;

  perform public.write_audit_log(
    v_invitation.organization_id, 'accept_invitation', 'memberships',
    coalesce(v_membership_id, v_invitation.id), null,
    jsonb_build_object('email', v_invitation.email, 'role', v_invitation.role)
  );

  return query
  select o.id, o.slug
  from public.organizations o
  where o.id = v_invitation.organization_id;
end;
$$;

create function public.set_member_role(
  p_membership_id uuid,
  p_role public.member_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member record;
begin
  select m.id, m.organization_id, m.user_id, m.role
  into v_member
  from public.memberships m
  where m.id = p_membership_id
  for update;

  if not found then
    raise exception 'Team member not found.';
  end if;

  perform public.require_org_role(
    v_member.organization_id, array['owner']::public.member_role[]
  );

  if v_member.role = 'owner' or p_role is null or p_role = 'owner' then
    raise exception 'The owner role cannot be changed here.';
  end if;

  if v_member.role = p_role then
    return;
  end if;

  update public.memberships m
  set role = p_role, updated_at = now()
  where m.id = p_membership_id;

  perform public.write_audit_log(
    v_member.organization_id, 'set_member_role', 'memberships', p_membership_id,
    jsonb_build_object('role', v_member.role),
    jsonb_build_object('role', p_role)
  );
end;
$$;

create function public.set_member_active(
  p_membership_id uuid,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member record;
  v_caller_role public.member_role;
begin
  select m.id, m.organization_id, m.user_id, m.role, m.is_active
  into v_member
  from public.memberships m
  where m.id = p_membership_id
  for update;

  if not found then
    raise exception 'Team member not found.';
  end if;

  v_caller_role := public.require_org_role(
    v_member.organization_id, array['owner', 'admin']::public.member_role[]
  );

  if v_member.role = 'owner' then
    raise exception 'The owner cannot be removed from the business.';
  end if;

  if v_member.user_id = auth.uid() then
    raise exception 'You cannot change your own access.';
  end if;

  if v_member.role = 'admin' and v_caller_role <> 'owner' then
    raise exception 'Only the owner can change an admin''s access.';
  end if;

  if p_is_active is null or v_member.is_active = p_is_active then
    return;
  end if;

  if p_is_active then
    perform public.assert_member_seat_available(v_member.organization_id);
  end if;

  update public.memberships m
  set is_active = p_is_active, updated_at = now()
  where m.id = p_membership_id;

  perform public.write_audit_log(
    v_member.organization_id,
    case when p_is_active then 'reactivate_member' else 'deactivate_member' end,
    'memberships', p_membership_id,
    jsonb_build_object('is_active', v_member.is_active),
    jsonb_build_object('is_active', p_is_active)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security: read-only for clients, scoped to the caller's businesses
-- ---------------------------------------------------------------------------

alter table public.plans enable row level security;
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.locations enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_logs enable row level security;

revoke all on
  public.plans,
  public.profiles,
  public.organizations,
  public.locations,
  public.memberships,
  public.invitations,
  public.audit_logs
from anon, authenticated;

grant select on public.plans to anon, authenticated;
grant select on
  public.profiles,
  public.organizations,
  public.locations,
  public.memberships,
  public.invitations,
  public.audit_logs
to authenticated;
grant update (full_name) on public.profiles to authenticated;

create policy "plans are public"
on public.plans for select
to anon, authenticated
using (true);

create policy "read own profile and teammates"
on public.profiles for select
to authenticated
using (id = (select auth.uid()) or public.shares_org_with(id));

create policy "update own profile"
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "members read their business"
on public.organizations for select
to authenticated
using (public.is_org_member(id));

create policy "members read locations"
on public.locations for select
to authenticated
using (public.is_org_member(organization_id));

create policy "members read their team"
on public.memberships for select
to authenticated
using (public.is_org_member(organization_id));

create policy "admins read invitations"
on public.invitations for select
to authenticated
using (
  public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[])
);

create policy "admins read audit log"
on public.audit_logs for select
to authenticated
using (
  public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[])
);

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke all on function public.handle_auth_user_change() from public, anon, authenticated;
revoke all on function public.write_audit_log(uuid, text, text, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.assert_member_seat_available(uuid, text) from public, anon, authenticated;
revoke all on function public.require_org_role(uuid, public.member_role[]) from public, anon, authenticated;

revoke all on function public.is_org_member(uuid) from public, anon;
revoke all on function public.has_org_role(uuid, public.member_role[]) from public, anon;
revoke all on function public.shares_org_with(uuid) from public, anon;
revoke all on function public.create_organization(text, text) from public, anon;
revoke all on function public.update_organization(uuid, text, text) from public, anon;
revoke all on function public.create_location(uuid, text) from public, anon;
revoke all on function public.invite_member(uuid, text, public.member_role) from public, anon;
revoke all on function public.revoke_invitation(uuid) from public, anon;
revoke all on function public.accept_invitation(text) from public, anon;
revoke all on function public.set_member_role(uuid, public.member_role) from public, anon;
revoke all on function public.set_member_active(uuid, boolean) from public, anon;
revoke all on function public.get_invitation_preview(text) from public;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, public.member_role[]) to authenticated;
grant execute on function public.shares_org_with(uuid) to authenticated;
grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.update_organization(uuid, text, text) to authenticated;
grant execute on function public.create_location(uuid, text) to authenticated;
grant execute on function public.invite_member(uuid, text, public.member_role) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.set_member_role(uuid, public.member_role) to authenticated;
grant execute on function public.set_member_active(uuid, boolean) to authenticated;
grant execute on function public.get_invitation_preview(text) to anon, authenticated;
