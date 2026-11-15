-- Empty exchanges on their own, as in Bilikis: the supplier taking empties is
-- recorded on its own sheet, not on the stock-in form. Each exchange keeps
-- the supplier's delivery reference (required for drinks), how many RGB
-- crates came with that delivery (for the record), and how many empties the
-- supplier took (the only number that changes the empties in store).

alter table public.supplier_exchanges
  add column crates_delivered numeric(14, 2) check (crates_delivered >= 0);

create function public.record_empty_exchange(
  p_organization_id uuid,
  p_location_id uuid,
  p_exchange_date date,
  p_returnable_item_id uuid,
  p_quantity numeric,
  p_crates_delivered numeric,
  p_supplier_name text,
  p_reference text,
  p_received_by text,
  p_note text
)
returns table (id uuid, exchange_no text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_drinks boolean;
  v_exchange record;
begin
  perform public.require_org_role(
    p_organization_id, array['owner', 'admin', 'staff']::public.member_role[]
  );

  select coalesce(org.sells_drinks, false) into v_drinks
  from public.organizations org where org.id = p_organization_id;

  if v_drinks and nullif(btrim(coalesce(p_reference, '')), '') is null then
    raise exception 'Enter the supplier''s delivery reference.';
  end if;
  if p_crates_delivered is not null and (p_crates_delivered < 0 or p_crates_delivered <> trunc(p_crates_delivered)) then
    raise exception 'Enter the RGB crates delivered as a whole number, or leave it empty.';
  end if;

  select e.id, e.exchange_no into v_exchange
  from public.record_supplier_exchange(
    p_organization_id, p_location_id, p_exchange_date, p_returnable_item_id, p_quantity,
    p_supplier_name, p_reference, p_received_by, p_note
  ) as e;

  update public.supplier_exchanges e
  set crates_delivered = p_crates_delivered
  where e.id = v_exchange.id;

  return query select v_exchange.id, v_exchange.exchange_no;
end;
$$;

revoke all on function public.record_empty_exchange(uuid, uuid, date, uuid, numeric, numeric, text, text, text, text) from public, anon;
grant execute on function public.record_empty_exchange(uuid, uuid, date, uuid, numeric, numeric, text, text, text, text) to authenticated;
