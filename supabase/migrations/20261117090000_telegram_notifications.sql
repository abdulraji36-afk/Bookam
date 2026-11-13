-- Iteration 6 (part 1): Telegram notifications, per business.
--
-- One Bookam bot serves every business. Each business links its own Telegram
-- group (or a private chat) by opening a link that carries a one-time code.
-- After that, the app posts a short message there whenever something happens.

create table public.organization_notifications (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  telegram_chat_id bigint,
  telegram_chat_title text,
  telegram_linked_at timestamptz,
  telegram_linked_by uuid references public.profiles (id) on delete set null,
  is_enabled boolean not null default true,
  -- Only the SHA-256 of the one-time link code is stored.
  link_code_hash text unique,
  link_code_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.organization_notifications enable row level security;

revoke all on public.organization_notifications from anon, authenticated;
grant select (
  organization_id, telegram_chat_title, telegram_linked_at, is_enabled, link_code_expires_at, updated_at
) on public.organization_notifications to authenticated;

-- Owners and admins can see whether Telegram is linked. Nobody can read the
-- chat id or the code hash through the API.
create policy "admins read notification settings"
on public.organization_notifications for select to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));

-- ---------------------------------------------------------------------------
-- Linking
-- ---------------------------------------------------------------------------

-- Returns a one-time code, valid for 30 minutes, to put in the Telegram link.
create function public.start_telegram_link(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  perform public.require_org_role(p_organization_id, array['owner', 'admin']::public.member_role[]);

  v_code := replace(gen_random_uuid()::text, '-', '');

  insert into public.organization_notifications as n (
    organization_id, link_code_hash, link_code_expires_at, telegram_linked_by
  )
  values (
    p_organization_id,
    encode(sha256(convert_to(v_code, 'UTF8')), 'hex'),
    now() + interval '30 minutes',
    auth.uid()
  )
  on conflict (organization_id) do update
  set link_code_hash = excluded.link_code_hash,
      link_code_expires_at = excluded.link_code_expires_at,
      telegram_linked_by = excluded.telegram_linked_by,
      updated_at = now();

  return v_code;
end;
$$;

-- Called by the app's Telegram webhook, which has no signed-in user: the code
-- itself is the proof. It is random, single-use and short-lived.
create function public.complete_telegram_link(
  p_code text,
  p_chat_id bigint,
  p_chat_title text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings record;
  v_name text;
begin
  if p_chat_id is null or coalesce(p_code, '') !~ '^[0-9a-f]{32}$' then
    return null;
  end if;

  select n.organization_id, n.link_code_expires_at
  into v_settings
  from public.organization_notifications n
  where n.link_code_hash = encode(sha256(convert_to(p_code, 'UTF8')), 'hex')
  for update;

  if not found or v_settings.link_code_expires_at <= now() then
    return null;
  end if;

  update public.organization_notifications n
  set telegram_chat_id = p_chat_id,
      telegram_chat_title = nullif(left(btrim(coalesce(p_chat_title, '')), 120), ''),
      telegram_linked_at = now(),
      is_enabled = true,
      link_code_hash = null,
      link_code_expires_at = null,
      updated_at = now()
  where n.organization_id = v_settings.organization_id;

  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, new_values)
  select
    n.organization_id, n.telegram_linked_by, 'connect_telegram', 'organizations', n.organization_id,
    jsonb_build_object('name', n.telegram_chat_title)
  from public.organization_notifications n
  where n.organization_id = v_settings.organization_id;

  select o.name into v_name from public.organizations o where o.id = v_settings.organization_id;
  return v_name;
end;
$$;

create function public.disconnect_telegram(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_org_role(p_organization_id, array['owner', 'admin']::public.member_role[]);

  update public.organization_notifications n
  set telegram_chat_id = null,
      telegram_chat_title = null,
      telegram_linked_at = null,
      link_code_hash = null,
      link_code_expires_at = null,
      updated_at = now()
  where n.organization_id = p_organization_id;

  perform public.write_audit_log(
    p_organization_id, 'disconnect_telegram', 'organizations', p_organization_id, null, null
  );
end;
$$;

create function public.set_notifications_enabled(p_organization_id uuid, p_is_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_org_role(p_organization_id, array['owner', 'admin']::public.member_role[]);

  update public.organization_notifications n
  set is_enabled = coalesce(p_is_enabled, false), updated_at = now()
  where n.organization_id = p_organization_id;

  perform public.write_audit_log(
    p_organization_id,
    case when coalesce(p_is_enabled, false) then 'enable_notifications' else 'disable_notifications' end,
    'organizations', p_organization_id, null, null
  );
end;
$$;

-- Where to send a notification about something the caller just did, and the
-- caller's name to sign it with. Returns nothing when Telegram is not linked
-- or notifications are switched off.
create function public.get_notification_target(p_organization_id uuid)
returns table (chat_id bigint, actor_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    n.telegram_chat_id,
    coalesce(nullif(p.full_name, ''), p.email, 'A team member')
  from public.organization_notifications n
  join public.profiles p on p.id = (select auth.uid())
  where n.organization_id = p_organization_id
    and n.telegram_chat_id is not null
    and n.is_enabled
    and public.is_org_member(p_organization_id);
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke all on function public.start_telegram_link(uuid) from public, anon;
revoke all on function public.disconnect_telegram(uuid) from public, anon;
revoke all on function public.set_notifications_enabled(uuid, boolean) from public, anon;
revoke all on function public.get_notification_target(uuid) from public, anon;
revoke all on function public.complete_telegram_link(text, bigint, text) from public;

grant execute on function public.start_telegram_link(uuid) to authenticated;
grant execute on function public.disconnect_telegram(uuid) to authenticated;
grant execute on function public.set_notifications_enabled(uuid, boolean) to authenticated;
grant execute on function public.get_notification_target(uuid) to authenticated;
grant execute on function public.complete_telegram_link(text, bigint, text) to anon, authenticated;
