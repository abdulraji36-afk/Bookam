-- Serial-numbered units no longer carry a condition (Brand new, UK used...).
-- A business that sells by condition puts it in the product's name, such as
-- "iPhone 15 128GB UK used", so each condition can have its own price.
--
-- p_items: [{ "product_id", "quantity" }] for ordinary products, and
-- [{ "product_id", "units": [{ "serial", "colour" }] }] for serial-numbered
-- ones, whose quantity is the number of units.
create or replace function public.record_stock_receipt(
  p_organization_id uuid,
  p_location_id uuid,
  p_received_date date,
  p_supplier_name text,
  p_reference text,
  p_note text,
  p_items jsonb
)
returns table (id uuid, receipt_no text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt_id uuid;
  v_receipt_no text;
  v_lines jsonb;
  v_units jsonb;
  v_row record;
begin
  perform public.require_org_role(
    p_organization_id, array['owner', 'admin', 'staff']::public.member_role[]
  );

  if p_received_date is null then
    raise exception 'Enter the date the stock arrived.';
  end if;
  if p_received_date > public.org_today(p_organization_id) then
    raise exception 'The date the stock arrived cannot be in the future.';
  end if;

  if not exists (
    select 1 from public.locations l
    where l.id = p_location_id
      and l.organization_id = p_organization_id
      and l.is_active
  ) then
    raise exception 'Choose one of your locations.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one product.';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'A single stock receipt can hold up to 200 products.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) i where nullif(i ->> 'product_id', '') is null) then
    raise exception 'Every line needs a product and a quantity greater than zero.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', i ->> 'product_id',
      'quantity', case
        when jsonb_typeof(i -> 'units') = 'array' then jsonb_array_length(i -> 'units')
        else (i ->> 'quantity')::numeric
      end,
      -- A line with no list of units must count as "no units", not "unknown".
      'has_units', coalesce(jsonb_typeof(i -> 'units') = 'array', false)
    )), '[]'::jsonb)
  into v_lines
  from jsonb_array_elements(p_items) i;

  select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', i ->> 'product_id',
      'serial', upper(regexp_replace(coalesce(u ->> 'serial', ''), '\s', '', 'g')),
      'colour', nullif(btrim(coalesce(u ->> 'colour', '')), '')
    )), '[]'::jsonb)
  into v_units
  from jsonb_array_elements(p_items) i,
       jsonb_array_elements(case when jsonb_typeof(i -> 'units') = 'array' then i -> 'units' else '[]'::jsonb end) u;

  if jsonb_array_length(v_units) > 500 then
    raise exception 'A single stock receipt can hold up to 500 serial numbers.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_lines) as item(product_id uuid, quantity numeric, has_units boolean)
    group by item.product_id
    having count(*) > 1
  ) then
    raise exception 'A product is listed more than once. Combine it into one line.';
  end if;

  -- Every product must belong to this business and be active.
  select coalesce(p.name, 'A product') as name
  into v_row
  from jsonb_to_recordset(v_lines) as item(product_id uuid, quantity numeric, has_units boolean)
  left join public.products p
    on p.id = item.product_id and p.organization_id = p_organization_id
  where p.id is null or not p.is_active
  limit 1;

  if found then
    raise exception '% is not an active product of this business.', v_row.name;
  end if;

  select p.name into v_row
  from jsonb_to_recordset(v_lines) as item(product_id uuid, quantity numeric, has_units boolean)
  join public.products p on p.id = item.product_id
  where p.tracks_serials and (not item.has_units or item.quantity = 0)
  limit 1;
  if found then
    raise exception 'Enter the serial number of each % received.', v_row.name;
  end if;

  select p.name into v_row
  from jsonb_to_recordset(v_lines) as item(product_id uuid, quantity numeric, has_units boolean)
  join public.products p on p.id = item.product_id
  where not p.tracks_serials and item.has_units and item.quantity > 0
  limit 1;
  if found then
    raise exception '% is not tracked by serial number. Enter a quantity instead.', v_row.name;
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_lines) as item(product_id uuid, quantity numeric, has_units boolean)
    where item.quantity is null or item.quantity <= 0
  ) then
    raise exception 'Every line needs a product and a quantity greater than zero.';
  end if;

  -- The units themselves.
  if exists (
    select 1 from jsonb_to_recordset(v_units) as u(product_id uuid, serial text, colour text)
    where char_length(u.serial) not between 3 and 40
  ) then
    raise exception 'Serial numbers must be 3 to 40 characters long.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(v_units) as u(product_id uuid, serial text, colour text)
    where char_length(u.colour) > 30
  ) then
    raise exception 'Colours must be 30 characters or fewer.';
  end if;

  select u.serial into v_row
  from jsonb_to_recordset(v_units) as u(product_id uuid, serial text, colour text)
  group by u.serial
  having count(*) > 1
  limit 1;
  if found then
    raise exception 'Serial number % is entered twice.', v_row.serial;
  end if;

  select u.serial_no as serial into v_row
  from public.product_units u
  join jsonb_to_recordset(v_units) as n(product_id uuid, serial text, colour text)
    on n.serial = u.serial_no
  where u.organization_id = p_organization_id and u.status <> 'sold'
  limit 1;
  if found then
    raise exception 'Serial number % is already in your stock or on an order.', v_row.serial;
  end if;

  v_receipt_no := public.next_document_number(p_organization_id, 'stock_receipt', 'STK', p_received_date);

  insert into public.stock_receipts (
    organization_id, location_id, receipt_no, received_date, supplier_name, reference, note, created_by
  )
  values (
    p_organization_id, p_location_id, v_receipt_no, p_received_date,
    nullif(left(btrim(coalesce(p_supplier_name, '')), 80), ''),
    nullif(left(btrim(coalesce(p_reference, '')), 80), ''),
    nullif(left(btrim(coalesce(p_note, '')), 500), ''),
    auth.uid()
  )
  returning stock_receipts.id into v_receipt_id;

  insert into public.stock_receipt_items (organization_id, receipt_id, product_id, quantity)
  select p_organization_id, v_receipt_id, item.product_id, item.quantity
  from jsonb_to_recordset(v_lines) as item(product_id uuid, quantity numeric, has_units boolean);

  insert into public.stock_movements (
    organization_id, location_id, product_id, movement_type, qty_in,
    source_type, source_id, movement_date, created_by
  )
  select
    p_organization_id, p_location_id, item.product_id, 'stock_in', item.quantity,
    'stock_receipt', v_receipt_id, p_received_date, auth.uid()
  from jsonb_to_recordset(v_lines) as item(product_id uuid, quantity numeric, has_units boolean);

  insert into public.product_units (
    organization_id, product_id, location_id, receipt_id, serial_no, colour
  )
  select
    p_organization_id, u.product_id, p_location_id, v_receipt_id, u.serial, u.colour
  from jsonb_to_recordset(v_units) as u(product_id uuid, serial text, colour text);

  perform public.write_audit_log(
    p_organization_id, 'record_stock_receipt', 'stock_receipts', v_receipt_id, null,
    jsonb_build_object(
      'receipt_no', v_receipt_no, 'received_date', p_received_date,
      'location_id', p_location_id, 'items', v_lines, 'units', v_units
    )
  );

  return query select v_receipt_id, v_receipt_no;
end;
$$;

alter table public.product_units drop column condition;
drop type public.unit_condition;
