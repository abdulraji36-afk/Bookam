import "server-only";
import type { OrderFormProduct } from "@/components/orders/order-form";
import type { ServerClient } from "@/lib/supabase/server";

/** Everything the order form needs to offer choices and show stock. */
export async function getOrderFormData(supabase: ServerClient, organizationId: string) {
  const [customers, products, locations, levels] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, area")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("products")
      .select("id, name, unit, selling_price")
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
      .eq("organization_id", organizationId)
  ]);

  const stock: Record<string, Record<string, number>> = {};
  for (const level of levels.data ?? []) {
    (stock[level.location_id] ??= {})[level.product_id] = Number(level.on_hand);
  }

  const productList: OrderFormProduct[] = (products.data ?? []).map((product) => ({
    id: product.id,
    name: product.name,
    unit: product.unit,
    price: product.selling_price === null ? null : Number(product.selling_price)
  }));

  return {
    customers: customers.data ?? [],
    products: productList,
    locations: locations.data ?? [],
    stock
  };
}
