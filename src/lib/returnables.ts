import "server-only";
import type { ServerClient } from "@/lib/supabase/server";

/** The choices every returns form needs. */
export async function getReturnsFormData(supabase: ServerClient, organizationId: string) {
  const [returnables, locations, customers] = await Promise.all([
    supabase.from("returnable_items").select("id, name").eq("organization_id", organizationId).order("name"),
    supabase
      .from("locations")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("created_at"),
    supabase
      .from("customers")
      .select("id, name, area")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name")
  ]);

  return {
    returnables: returnables.data ?? [],
    locations: locations.data ?? [],
    customers: (customers.data ?? []).map((customer) => ({
      id: customer.id,
      name: customer.area ? `${customer.name} (${customer.area})` : customer.name
    }))
  };
}

/**
 * For a drinks business: its pool of empties and how many are in store at
 * each location. A drinks business has one pool; the first is used if a
 * business from before has more.
 */
export async function getDrinksStock(supabase: ServerClient, organizationId: string) {
  const { data: items } = await supabase
    .from("returnable_items")
    .select("id, name")
    .eq("organization_id", organizationId)
    .order("created_at")
    .limit(1);
  const item = items?.[0];
  if (!item) return undefined;
  const { data: holdings } = await supabase
    .from("returnable_holdings")
    .select("location_id, holding")
    .eq("returnable_item_id", item.id);
  return {
    returnableItemId: item.id,
    returnableName: item.name,
    inStore: Object.fromEntries((holdings ?? []).map((row) => [row.location_id, Number(row.holding)]))
  };
}
