-- Iteration 15: who took the load, chosen from the list.
--
-- A trip records its driver, picked from the business's drivers, and the
-- workers who went with the load: at least one, any number. Trucks and plate
-- numbers are no longer recorded. (In the app "loaders" are now "workers", as
-- in Bilikis; the stored role keeps its old name.)

alter table public.dispatch_trips
  add column driver_id uuid references public.dispatch_workers (id);

create or replace function public.save_dispatch_worker(
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
    raise exception 'Choose whether this is a driver or a worker.';
  end if;

  if exists (
    select 1 from public.dispatch_workers w
    where w.organization_id = p_organization_id
      and w.role = p_role
      and lower(btrim(w.name)) = lower(v_name)
      and w.id is distinct from v_id
  ) then
    raise exception 'You already have a % called %.', case p_role when 'loader' then 'worker' else 'driver' end, v_name;
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

drop function public.create_dispatch_trip_with_crew(uuid, uuid, date, text, text, text, uuid[], uuid[]);

create function public.create_dispatch_trip_with_crew(
  p_organization_id uuid,
  p_location_id uuid,
  p_dispatch_date date,
  p_driver_id uuid,
  p_note text,
  p_order_ids uuid[],
  p_worker_ids uuid[]
)
returns table (id uuid, trip_no text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver text;
  v_trip_id uuid;
  v_trip_no text;
begin
  perform public.require_org_role(p_organization_id, array['owner', 'admin', 'staff']::public.member_role[]);

  select w.name into v_driver
  from public.dispatch_workers w
  where w.id = p_driver_id
    and w.organization_id = p_organization_id
    and w.role = 'driver'
    and w.is_active;
  if v_driver is null then
    raise exception 'Choose the driver from your list.';
  end if;

  if cardinality(coalesce(p_worker_ids, '{}'::uuid[])) = 0 then
    raise exception 'Choose at least one worker who went with the load.';
  end if;

  select t.id, t.trip_no into v_trip_id, v_trip_no
  from public.create_dispatch_trip(
    p_organization_id, p_location_id, p_dispatch_date, v_driver, null, p_note, p_order_ids
  ) t;

  update public.dispatch_trips t set driver_id = p_driver_id where t.id = v_trip_id;
  perform public.set_trip_loaders(v_trip_id, p_worker_ids);

  return query select v_trip_id, v_trip_no;
end;
$$;

-- Workers on a trip must still be chosen from the list (and stay at least one).
create or replace function public.set_trip_loaders(p_trip_id uuid, p_worker_ids uuid[])
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
    raise exception 'Workers can only be changed before the trip is dispatched.';
  end if;
  if cardinality(coalesce(p_worker_ids, '{}'::uuid[])) = 0 then
    raise exception 'Choose at least one worker who went with the load.';
  end if;

  if exists (
    select 1 from unnest(p_worker_ids) as chosen(id)
    left join public.dispatch_workers w
      on w.id = chosen.id and w.organization_id = v_trip.organization_id and w.role = 'loader' and w.is_active
    where w.id is null
  ) then
    raise exception 'Choose workers from your list.';
  end if;

  delete from public.dispatch_trip_loaders l where l.trip_id = p_trip_id;
  insert into public.dispatch_trip_loaders (trip_id, worker_id, organization_id)
  select distinct p_trip_id, chosen.id, v_trip.organization_id
  from unnest(p_worker_ids) as chosen(id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

-- Trips are created only with a driver and workers from the list.
revoke execute on function public.create_dispatch_trip(uuid, uuid, date, text, text, text, uuid[]) from authenticated;

revoke all on function public.create_dispatch_trip_with_crew(uuid, uuid, date, uuid, text, uuid[], uuid[]) from public, anon;
grant execute on function public.create_dispatch_trip_with_crew(uuid, uuid, date, uuid, text, uuid[], uuid[]) to authenticated;
