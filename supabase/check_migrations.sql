-- Which BukAm migrations are in this database? Paste into the Supabase SQL
-- editor and run. Each migration is checked by something it creates or
-- changes, so this works however the migrations were applied. Any row with
-- applied = false is a migration still to run (run them in this order).
with
  col(t, c) as (
    select table_name::text, column_name::text
    from information_schema.columns
    where table_schema = 'public'
  ),
  fn(name, src, result) as (
    select p.proname::text, p.prosrc, pg_get_function_result(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  ),
  checks(migration, applied) as (
    values
      ('20261112190000_tenancy_foundation', to_regclass('public.organizations') is not null),
      ('20261113090000_catalog_and_stock', to_regclass('public.products') is not null),
      ('20261114090000_orders_and_dispatch', to_regclass('public.orders') is not null),
      ('20261115090000_returnables', to_regclass('public.returnable_movements') is not null),
      ('20261116090000_voids_and_reports', exists (select 1 from col where t = 'orders' and c = 'voided_at')),
      ('20261117090000_telegram_notifications', to_regclass('public.organization_notifications') is not null),
      ('20261118090000_serials_and_counter_sales', to_regclass('public.product_units') is not null),
      ('20261119090000_remove_unit_condition',
        to_regclass('public.product_units') is not null
        and not exists (select 1 from col where t = 'product_units' and c = 'condition')),
      ('20261120090000_unit_written_off', exists (
        select 1 from pg_enum e join pg_type ty on ty.oid = e.enumtypid
        where ty.typname = 'unit_status' and e.enumlabel = 'written_off')),
      ('20261120090100_features_and_writeoffs', exists (select 1 from col where t = 'organizations' and c = 'tracks_returns')),
      ('20261121090000_selling_mode', exists (select 1 from col where t = 'organizations' and c = 'selling_mode')),
      ('20261122090000_drinks', exists (select 1 from col where t = 'organizations' and c = 'sells_drinks')),
      ('20261123090000_drinks_operations', to_regclass('public.dispatch_workers') is not null),
      ('20261124090000_bilikis_parity', exists (select 1 from pg_trigger where tgname = 'stock_movements_whole_crates')),
      ('20261125090000_simple_customers_and_delivery_changes', to_regclass('public.stock_receipt_corrections') is not null),
      ('20261126090000_remove_write_offs', exists (select 1 from fn where name = 'void_stock_adjustment')
        and not has_function_privilege('authenticated', 'public.void_stock_adjustment(uuid, text)', 'execute')),
      ('20261127090000_trip_driver_and_workers', exists (select 1 from col where t = 'dispatch_trips' and c = 'driver_id')),
      ('20261128090000_drinks_shortage_lines', to_regclass('public.empties_followups') is not null),
      ('20261129090000_followups_admin_only', exists (
        select 1 from fn where name = 'record_empties_followup' and src not like '%''staff''%')),
      ('20261130090000_empty_exchanges', exists (select 1 from col where t = 'supplier_exchanges' and c = 'crates_delivered')),
      ('20261201090000_drinks_orders_by_kind', exists (select 1 from pg_trigger where tgname = 'order_items_drinks_one_kind')),
      ('20261202090000_batch_walk_ins', exists (select 1 from fn where name = 'create_order_batch')),
      ('20261203090000_drinks_customers_only', exists (select 1 from pg_trigger where tgname = 'orders_drinks_need_a_customer')),
      ('20261204090000_stock_summary', exists (select 1 from fn where name = 'empties_summary')),
      ('20261205090000_stock_summary_totals', exists (select 1 from fn where name = 'stock_summary' and result like '%total_in%')),
      ('20261206090000_empty_balance', exists (select 1 from fn where name = 'set_opening_empties')),
      ('20261207090000_product_display_order', exists (select 1 from col where t = 'organizations' and c = 'product_order')),
      ('20261208090000_correct_sale', exists (select 1 from fn where name = 'correct_order')),
      ('20261209090000_daily_summary', exists (select 1 from col where t = 'organization_notifications' and c = 'daily_summary_sent_for')),
      ('20261210090000_goods_depot', exists (select 1 from col where t = 'organizations' and c = 'trade')),
      ('20261211090000_counter_returns', exists (select 1 from fn where name = 'hand_over_order' and src like '%Counter%'))
  )
select migration, applied
from checks
order by migration;
