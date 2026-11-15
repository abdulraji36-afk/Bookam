import type { ServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

/**
 * Drinks empties, the Bilikis way: every order that came back short is its
 * own line. Outstanding = expected − (returned with the trip + follow-ups),
 * never below 0. A line is open while something is outstanding and completed
 * at 0, and completed lines stay listed.
 */
export type ShortageLine = Database["public"]["Views"]["empty_shortage_lines"]["Row"];

const COLUMNS =
  "id, organization_id, trip_id, trip_no, location_id, order_id, order_no, order_date, customer_id, customer_name, returnable_item_id, returnable_name, returned_date, returned_at, expected, initial_returned, followup_returned, total_returned, outstanding, last_followup_at, completed_at";

/** Open lines first, then the newest trip return first. */
export function sortShortageLines(rows: ShortageLine[]) {
  return [...rows].sort((left, right) => {
    const leftOpen = Number(left.outstanding) > 0;
    const rightOpen = Number(right.outstanding) > 0;
    if (leftOpen !== rightOpen) return leftOpen ? -1 : 1;
    return new Date(right.returned_at ?? 0).getTime() - new Date(left.returned_at ?? 0).getTime();
  });
}

export async function getShortageLines(
  supabase: ServerClient,
  organizationId: string,
  filter: { from?: string; to?: string; customerId?: string; orderId?: string; openOnly?: boolean } = {}
) {
  let query = supabase.from("empty_shortage_lines").select(COLUMNS).eq("organization_id", organizationId);
  if (filter.from) query = query.gte("returned_date", filter.from);
  if (filter.to) query = query.lte("returned_date", filter.to);
  if (filter.customerId) query = query.eq("customer_id", filter.customerId);
  if (filter.orderId) query = query.eq("order_id", filter.orderId);
  if (filter.openOnly) query = query.gt("outstanding", 0);
  const { data, error } = await query.order("returned_at", { ascending: false }).limit(5000);
  return { rows: sortShortageLines((data ?? []) as ShortageLine[]), error: error?.message ?? null };
}

/** The three summary cards on the Empty shortages page. */
export function shortageSummary(rows: ShortageLine[]) {
  const open = rows.filter((row) => Number(row.outstanding) > 0);
  return {
    records: rows.length,
    openCustomers: new Set(open.map((row) => row.customer_id ?? row.customer_name)).size,
    outstanding: open.reduce((sum, row) => sum + Number(row.outstanding), 0)
  };
}

/** "15 Nov 2026, 14:05" in the business's time zone. */
export function formatDateTime(value: string | null, timeZone: string) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
}
