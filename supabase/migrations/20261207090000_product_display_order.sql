-- Bilikis's saved product display order: an owner or admin puts the products
-- in the order the depot thinks in, and every product list (the order screen,
-- stock summary, daily report, inventory value) follows it. Products not in
-- the saved order come after, in the NBC product order.

alter table public.organizations
  add column product_order uuid[] not null default '{}';

create function public.save_product_order(p_organization_id uuid, p_product_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old uuid[];
begin
  perform public.require_org_role(p_organization_id, array['owner', 'admin']::public.member_role[]);

  if p_product_ids is null or cardinality(p_product_ids) = 0 then
    raise exception 'Put at least one product in order.';
  end if;
  if cardinality(p_product_ids) <> (select count(distinct id) from unnest(p_product_ids) as ids(id)) then
    raise exception 'A product appears twice in the order.';
  end if;
  if exists (
    select 1 from unnest(p_product_ids) as ids(id)
    where not exists (
      select 1 from public.products p
      where p.id = ids.id and p.organization_id = p_organization_id
    )
  ) then
    raise exception 'The product list changed. Refresh the page and try again.';
  end if;

  select o.product_order into v_old
  from public.organizations o
  where o.id = p_organization_id
  for update;

  update public.organizations o
  set product_order = p_product_ids
  where o.id = p_organization_id;

  perform public.write_audit_log(
    p_organization_id, 'save_product_order', 'organizations', p_organization_id,
    jsonb_build_object('product_order', to_jsonb(v_old)),
    jsonb_build_object('product_order', to_jsonb(p_product_ids))
  );
end;
$$;

revoke all on function public.save_product_order(uuid, uuid[]) from public, anon;
grant execute on function public.save_product_order(uuid, uuid[]) to authenticated;
