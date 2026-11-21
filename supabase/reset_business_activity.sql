-- Reset one business to zero, keeping its set-up.
--
-- KEEPS: the business and its settings, team and invitations, locations,
-- products (prices, costs, saved order), the Empties item, customers,
-- drivers and workers, and the Telegram link.
-- WIPES: every order, trip, trip return, empty shortage and follow-up,
-- stock in (deliveries), stock movement, empty exchange, empty adjustment
-- (opening empties included) and the audit log. Stock and empties read 0
-- afterwards, and order, trip and stock-in numbers start again at 0001.
--
-- This cannot be undone. Put the business's address name in place of
-- your-business-slug below (the part after /b/ in the app's address), then
-- run the whole file in the Supabase SQL editor. It only touches that one
-- business, and stops without changing anything if the name is not found.

do $$
declare
  v_slug constant text := 'your-business-slug';
  v_org uuid;
  v_name text;
begin
  select o.id, o.name into v_org, v_name from public.organizations o where o.slug = v_slug;
  if v_org is null then
    raise exception 'No business with the address name "%". Nothing was changed.', v_slug;
  end if;

  -- Children first, then what they point at.
  delete from public.empties_followups where organization_id = v_org;
  delete from public.trip_return_lines where organization_id = v_org;
  delete from public.dispatch_trip_loaders where organization_id = v_org;
  delete from public.dispatch_trip_orders where organization_id = v_org;
  delete from public.dispatch_trips where organization_id = v_org;
  delete from public.product_units where organization_id = v_org;
  delete from public.order_items where organization_id = v_org;
  delete from public.orders where organization_id = v_org;

  delete from public.returnable_movements where organization_id = v_org;
  delete from public.returnable_adjustments where organization_id = v_org;
  delete from public.supplier_exchanges where organization_id = v_org;

  delete from public.stock_movements where organization_id = v_org;
  delete from public.stock_adjustments where organization_id = v_org;
  delete from public.stock_receipt_corrections where organization_id = v_org;
  delete from public.stock_receipt_item_costs where organization_id = v_org;
  delete from public.stock_receipt_items where organization_id = v_org;
  delete from public.stock_receipts where organization_id = v_org;

  -- Numbering starts again; the next daily Telegram summary is not skipped.
  delete from public.document_sequences where organization_id = v_org;
  update public.organization_notifications set daily_summary_sent_for = null where organization_id = v_org;
  delete from public.audit_logs where organization_id = v_org;

  raise notice 'Reset % (%) to zero. Products, customers, team and workers were kept.', v_name, v_slug;
end;
$$;

-- Check: every product should show 0 stock, and the empties 0.
select p.name as product, coalesce(sum(m.qty_in - m.qty_out), 0) as stock
from public.products p
join public.organizations o on o.id = p.organization_id and o.slug = 'your-business-slug'
left join public.stock_movements m on m.product_id = p.id
group by p.name
union all
select 'EMPTIES in store', coalesce(sum(m.holding_delta), 0)
from public.returnable_movements m
join public.organizations o on o.id = m.organization_id and o.slug = 'your-business-slug'
order by 1;
