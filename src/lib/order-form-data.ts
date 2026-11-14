import "server-only";
import type { OrderFormProduct } from "@/components/orders/order-form";
import type { PickableUnit } from "@/components/orders/unit-picker";
import type { ServerClient } from "@/lib/supabase/server";

/**
 * Everything the order form needs to offer choices and show stock. When an
 * order is being edited, the units it already holds can be chosen too.
 */
export async function getOrderFormData(supabase: ServerClient, organizationId: string, editingOrderId?: string) {
  let unitQuery = supabase
    .from("product_units")
    .select("id, product_id, location_id, serial_no, colour, condition")
    .eq("organization_id", organizationId)
    .order("serial_no")
    .limit(5000);
  // The id goes into a filter string, so only a well-formed id is used.
  const isOrderId = editingOrderId !== undefined && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(editingOrderId);
  unitQuery = isOrderId
    ? unitQuery.or(`status.eq.in_stock,order_id.eq.${editingOrderId}`)
    : unitQuery.eq("status", "in_stock");

  const [customers, products, locations, levels, unitRows] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, area")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("products")
      .select("id, name, unit, selling_price, tracks_serials, returnable_item_id")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("locations")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("created_at"),
    supabase
      .from("product_stock_levels")
      .select("location_id, product_id, on_hand")
      .eq("organization_id", organizationId),
    unitQuery
  ]);

  const stock: Record<string, Record<string, number>> = {};
  for (const level of levels.data ?? []) {
    (stock[level.location_id] ??= {})[level.product_id] = Number(level.on_hand);
  }

  const productList: OrderFormProduct[] = (products.data ?? []).map((product) => ({
    id: product.id,
    name: product.name,
    unit: product.unit,
    price: product.selling_price === null ? null : Number(product.selling_price),
    tracksSerials: product.tracks_serials,
    returnable: product.returnable_item_id !== null
  }));

  const units: PickableUnit[] = (unitRows.data ?? []).map((unit) => ({
    id: unit.id,
    productId: unit.product_id,
    locationId: unit.location_id,
    serial: unit.serial_no,
    colour: unit.colour,
    condition: unit.condition
  }));

  return {
    customers: customers.data ?? [],
    products: productList,
    locations: locations.data ?? [],
    stock,
    units
  };
}
