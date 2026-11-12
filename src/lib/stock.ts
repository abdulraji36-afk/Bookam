import "server-only";
import type { ServerClient } from "@/lib/supabase/server";

export type StockRow = {
  productId: string;
  name: string;
  unit: string;
  onHand: number;
  isLow: boolean;
};

/**
 * Stock on hand for every active product, for one location or (when
 * locationId is null) added up across all of them. The sums are done by the
 * database; this only joins them to the product names.
 */
export async function getStockRows(
  supabase: ServerClient,
  organizationId: string,
  locationId: string | null
): Promise<StockRow[]> {
  const levels = locationId
    ? supabase
        .from("product_stock_levels")
        .select("product_id, on_hand")
        .eq("organization_id", organizationId)
        .eq("location_id", locationId)
    : supabase.from("product_stock_totals").select("product_id, on_hand").eq("organization_id", organizationId);

  const [productsResult, levelsResult] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, unit, low_stock_threshold")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name"),
    levels
  ]);

  const onHandByProduct = new Map(
    (levelsResult.data ?? []).map((level) => [level.product_id, Number(level.on_hand)])
  );

  return (productsResult.data ?? []).map((product) => {
    const onHand = onHandByProduct.get(product.id) ?? 0;
    const threshold = Number(product.low_stock_threshold);
    return {
      productId: product.id,
      name: product.name,
      unit: product.unit,
      onHand,
      isLow: threshold > 0 && onHand <= threshold
    };
  });
}
