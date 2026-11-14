import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, PageSkeleton, PageTitle } from "@/components/ui/card";
import { CONDITION_LABELS, formatDate, formatQuantity } from "@/lib/format";
import { requireOrg } from "@/lib/org";
import { getStockRows } from "@/lib/stock";

export const metadata: Metadata = { title: "Stock" };

async function Stock({ params, searchParams }: PageProps<"/b/[slug]/stock">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { supabase, org } = await requireOrg(slug);
  const base = `/b/${org.slug}/stock`;

  const { data: locationData } = await supabase
    .from("locations")
    .select("id, name")
    .eq("organization_id", org.id)
    .eq("is_active", true)
    .order("created_at");
  const locations = locationData ?? [];
  const selected = locations.find((location) => location.id === query.location) ?? null;

  let unitQuery = supabase
    .from("product_units")
    .select("product_id, colour, condition")
    .eq("organization_id", org.id)
    .eq("status", "in_stock")
    .limit(10000);
  if (selected) unitQuery = unitQuery.eq("location_id", selected.id);

  const [rows, receiptsResult, unitsResult] = await Promise.all([
    getStockRows(supabase, org.id, selected?.id ?? null),
    supabase
      .from("stock_receipts")
      .select("id, receipt_no, received_date, supplier_name, voided_at, locations (name), stock_receipt_items (quantity)")
      .eq("organization_id", org.id)
      .order("received_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(10),
    unitQuery
  ]);
  const receipts = receiptsResult.data ?? [];
  const hasSerials = (unitsResult.data ?? []).length > 0;

  // For serial-numbered products: how many of each colour and condition.
  const breakdown = new Map<string, Map<string, number>>();
  for (const unit of unitsResult.data ?? []) {
    const label = [unit.colour, CONDITION_LABELS[unit.condition]].filter(Boolean).join(", ");
    const counts = breakdown.get(unit.product_id) ?? new Map<string, number>();
    counts.set(label, (counts.get(label) ?? 0) + 1);
    breakdown.set(unit.product_id, counts);
  }
  const lowCount = rows.filter((row) => row.isLow).length;

  return (
    <div className="space-y-6">
      <div className="page-head">
        <PageTitle
          sub={
            lowCount > 0
              ? `${lowCount} product${lowCount === 1 ? " is" : "s are"} running low.`
              : "What you have on hand right now."
          }
        >
          Stock
        </PageTitle>
        <Link href={`${base}/receive`} className={buttonClass("primary")}>
          + Receive stock
        </Link>
      </div>

      {hasSerials ? (
        <form method="get" action={`${base}/serials`} className="flex flex-wrap items-end gap-2" role="search">
          <label className="min-w-0 flex-1 text-sm font-bold">
            Find a serial number
            <input
              type="search"
              name="q"
              autoComplete="off"
              placeholder="Type or scan a serial / IMEI"
              className="mt-1.5 block min-h-12 w-full rounded-md border-2 border-field bg-white px-3 text-base font-medium placeholder:font-normal placeholder:text-ink-soft/70 focus:border-ink focus:outline-2 focus:outline-accent"
            />
          </label>
          <button type="submit" className={buttonClass("secondary")}>
            Find
          </button>
        </form>
      ) : null}

      {locations.length > 1 ? (
        <nav aria-label="Location" className="flex flex-wrap gap-2">
          <Link
            href={base}
            aria-current={selected ? undefined : "page"}
            className={buttonClass(selected ? "secondary" : "primary", "sm")}
          >
            All locations
          </Link>
          {locations.map((location) => (
            <Link
              key={location.id}
              href={`${base}?location=${location.id}`}
              aria-current={selected?.id === location.id ? "page" : undefined}
              className={buttonClass(selected?.id === location.id ? "primary" : "secondary", "sm")}
            >
              {location.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="No products yet">
          Add your products first, then record the stock you have.
        </EmptyState>
      ) : (
        <Card className="!p-0">
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={row.productId} className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-lg font-extrabold">{row.name}</p>
                  {breakdown.has(row.productId) ? (
                    <p className="text-sm font-medium text-ink-soft">
                      {[...breakdown.get(row.productId)!.entries()]
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([label, count]) => `${label} ×${count}`)
                        .join(" · ")}
                    </p>
                  ) : null}
                  {row.isLow ? <Badge tone="accent">Low stock</Badge> : null}
                </div>
                <p className="shrink-0 text-right">
                  <span className="text-3xl font-extrabold tabular-nums">{formatQuantity(row.onHand)}</span>{" "}
                  <span className="font-medium text-ink-soft">{row.unit}</span>
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="Stock received" />
        {receipts.length === 0 ? (
          <p className="text-ink-soft">Nothing received yet.</p>
        ) : (
          <ul className="-my-3 divide-y divide-line">
            {receipts.map((receipt) => {
              const total = receipt.stock_receipt_items.reduce((sum, item) => sum + Number(item.quantity), 0);
              return (
                <li key={receipt.id}>
                  <Link
                    href={`${base}/receipts/${receipt.id}`}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 hover:bg-paper"
                  >
                    <span>
                      <span className="block font-extrabold tabular-nums">{receipt.receipt_no}</span>
                      <span className="text-sm font-medium text-ink-soft">
                        {[formatDate(receipt.received_date, "UTC"), receipt.supplier_name, receipt.locations?.name]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    {receipt.voided_at ? (
                      <Badge tone="accent">Voided</Badge>
                    ) : (
                      <span className="font-extrabold tabular-nums">+{formatQuantity(total)}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function StockPage(props: PageProps<"/b/[slug]/stock">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Stock {...props} />
    </Suspense>
  );
}
