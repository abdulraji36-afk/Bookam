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
