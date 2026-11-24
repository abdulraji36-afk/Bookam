import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { SummaryCard, SummaryCards } from "@/components/ui/summary-card";
import { formatQuantity } from "@/lib/format";
import type { ServerClient } from "@/lib/supabase/server";

/**
 * The Bilikis dashboard cards for a drinks depot. Owners and admins see PET
 * sold today, open RGB trips, RGB sold today and the empty balance; staff see
 * stock-in entries, open RGB trips and what was sold today.
 */
export async function DrinksCards({
  supabase,
  organizationId,
  today,
  manager,
  t,
}: {
  supabase: ServerClient;
  organizationId: string;
  today: string;
  manager: boolean;
  t: (text: string) => string;
}) {
  const [sold, openTrips, empties, stockIn] = await Promise.all([
    supabase
      .from("order_summaries")
      .select("total_quantity, has_returns")
      .eq("organization_id", organizationId)
      .eq("order_date", today)
      .is("voided_at", null)
      .in("status", ["dispatched", "completed"])
      .limit(5000),
    supabase
      .from("dispatch_trip_summaries")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "dispatched")
      .eq("has_returns", true),
    supabase
      .from("returnable_totals")
      .select("holding")
      .eq("organization_id", organizationId),
    supabase
      .from("stock_receipts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("voided_at", null),
  ]);
  const failed = Boolean(
    sold.error ?? openTrips.error ?? empties.error ?? stockIn.error,
  );
  const show = (value: number) =>
    failed ? "Unavailable" : formatQuantity(value);
  const soldOf = (rgb: boolean) =>
    (sold.data ?? [])
      .filter((row) => row.has_returns === rgb)
      .reduce((sum, row) => sum + Number(row.total_quantity), 0);
  const emptyBalance = (empties.data ?? []).reduce(
    (sum, row) => sum + Number(row.holding),
    0,
  );

  return (
    <SummaryCards columns={4}>
      {manager ? (
        <>
          <SummaryCard label={t("PET sold today")} value={show(soldOf(false))} />
          <SummaryCard label={t("Open RGB trips")} value={show(openTrips.count ?? 0)} />
          <SummaryCard label={t("RGB sold today")} value={show(soldOf(true))} />
          <SummaryCard label={t("Empty balance")} value={show(emptyBalance)} strong />
        </>
      ) : (
        <>
          <SummaryCard label="Stock in entries" value={show(stockIn.count ?? 0)} />
          <SummaryCard label={t("Open RGB")} value={show(openTrips.count ?? 0)} />
          <SummaryCard label={t("PET sold today")} value={show(soldOf(false))} />
          <SummaryCard label={t("RGB sold today")} value={show(soldOf(true))} strong />
        </>
      )}
    </SummaryCards>
  );
}

function DeskLinks({
  links,
}: {
  links: { href: string; title: string; body: string }[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {links.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="flex min-h-22 flex-col justify-between rounded-md border-2 border-line bg-paper p-4 transition hover:border-ink hover:bg-white"
        >
          <span className="font-extrabold">{item.title}</span>
          <span className="mt-1.5 text-sm text-ink-soft">{item.body}</span>
        </Link>
      ))}
    </div>
  );
}

/** Bilikis's admin control desk, or the staff quick actions and today's focus. */
export function DrinksDesk({
  base,
  manager,
  t,
}: {
  base: string;
  manager: boolean;
  t: (text: string) => string;
}) {
  if (manager) {
    return (
      <Card>
        <CardHeader title="Admin control desk" />
        <DeskLinks
          links={[
            {
              href: `${base}/records/open-work`,
              title: "Incomplete work",
              body: t("Monitor unfinished PET and RGB sales and open dispatch work."),
            },
            {
              href: `${base}/records`,
              title: "Transactions",
              body: t("Review stock in, empty exchanges, PET sales and RGB sales."),
            },
            {
              href: `${base}/records/voided`,
              title: "Voided sales",
              body: "Review sales reversed by an owner or admin, with their reason and original status.",
            },
            {
              href: `${base}/stock/summary`,
              title: "Stock summary",
              body: t("Review the stock position, low stock and the empty balance."),
            },
            {
              href: `${base}/reports/daily`,
              title: "Daily operations",
              body: "Review the day's stock, sales, dispatches, returns and open work.",
            },
            {
              href: `${base}/returns/adjustments`,
              title: t("Empty balance"),
              body: t("Review opening empties, adjustments and the current depot balance."),
            },
            {
              href: `${base}/manage`,
              title: "Manage",
              body: "Products, customers, and the drivers and workers chosen on trips.",
            },
          ]}
        />
      </Card>
    );
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader title="Daily operations" />
        <DeskLinks
          links={[
            {
              href: `${base}/stock/summary`,
              title: "Stock summary",
              body: "Check current stock.",
            },
            {
              href: `${base}/customers/new`,
              title: "Add a customer",
              body: "Create a customer to sell to.",
            },
            {
              href: `${base}/records/pet`,
              title: t("PET history"),
              body: t("Review PET sales."),
            },
            {
              href: `${base}/records/rgb`,
              title: t("RGB sales"),
              body: t("Review RGB sales."),
            },
            {
              href: `${base}/returns/adjustments`,
              title: t("Empty adjustments"),
              body: t("Review changes to the empties count."),
            },
          ]}
        />
      </Card>
      <Card>
        <CardHeader
          title="Today's focus"
          description="Key checks for daily posting."
        />
        <ol className="space-y-2 font-medium text-ink-soft">
          <li>1. Confirm stock before selling.</li>
          <li>{t("2. Dispatch recorded PET sales when the truck is ready.")}</li>
          <li>{t("3. Close RGB returns after empties are counted.")}</li>
          <li>{t("4. Record empties handed to the supplier clearly.")}</li>
        </ol>
      </Card>
    </div>
  );
}
