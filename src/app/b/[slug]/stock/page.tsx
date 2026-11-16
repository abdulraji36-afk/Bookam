import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { Badge, EmptyState, PageSkeleton } from "@/components/ui/card";
import { DataTable, TableCard } from "@/components/ui/data-table";
import {
  FilterBar,
  PageHeader,
  StatusTabs,
  StockTabs,
} from "@/components/ui/page-header";
import { categoryOrder, formatQuantity } from "@/lib/format";
import { canManage, requireOrg } from "@/lib/org";
import { getStockRows, type StockRow } from "@/lib/stock";

export const metadata: Metadata = { title: "Stock" };

const INPUT =
  "mt-1.5 block min-h-12 w-full rounded-md border-2 border-field bg-white px-3 text-base font-medium placeholder:font-normal placeholder:text-ink-soft/70 focus:border-ink focus:outline-2 focus:outline-accent";

async function Stock({ params, searchParams }: PageProps<"/b/[slug]/stock">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { supabase, org, role } = await requireOrg(slug);
  const base = `/b/${org.slug}/stock`;
  const manager = canManage(role);

  const { data: locationData } = await supabase
    .from("locations")
    .select("id, name")
    .eq("organization_id", org.id)
    .eq("is_active", true)
    .order("created_at");
  const locations = locationData ?? [];
  const selected =
    locations.find((location) => location.id === query.location) ?? null;
  const lowOnly = query.show === "low";

  let unitQuery = supabase
    .from("product_units")
    .select("product_id, colour")
    .eq("organization_id", org.id)
    .eq("status", "in_stock")
    .limit(10000);
  if (selected) unitQuery = unitQuery.eq("location_id", selected.id);

  const [allRows, unitsResult] = await Promise.all([
    getStockRows(supabase, org.id, selected?.id ?? null),
    unitQuery,
  ]);
  const hasSerials = org.tracks_serials || (unitsResult.data ?? []).length > 0;
  const lowCount = allRows.filter((row) => row.isLow).length;
  const rows = lowOnly ? allRows.filter((row) => row.isLow) : allRows;

  // For serial-numbered products: how many of each colour.
  const breakdown = new Map<string, Map<string, number>>();
  for (const unit of unitsResult.data ?? []) {
    const label = unit.colour ?? "No colour";
    const counts = breakdown.get(unit.product_id) ?? new Map<string, number>();
    counts.set(label, (counts.get(label) ?? 0) + 1);
    breakdown.set(unit.product_id, counts);
  }

  const groups: [string | null, StockRow[]][] = org.sells_drinks
    ? // A drinks depot sees its stock by category, RGB first, as on the NBC list.
      [...new Set(rows.map((row) => row.category ?? "Other"))]
        .sort(
          (x, y) =>
            categoryOrder(x === "Other" ? null : x) -
            categoryOrder(y === "Other" ? null : y),
        )
        .map(
          (name) =>
            [
              name,
              rows.filter((row) => (row.category ?? "Other") === name),
            ] as [string, StockRow[]],
        )
    : org.selling_mode === "serial"
      ? (
          [
            ["With serial numbers", rows.filter((row) => row.tracksSerials)],
            ["Counted items", rows.filter((row) => !row.tracksSerials)],
          ] as [string, StockRow[]][]
        ).filter(([, groupRows]) => groupRows.length > 0)
      : [[null, rows]];

  const href = (change: { location?: string | null; show?: string | null }) => {
    const params = new URLSearchParams();
    const location =
      change.location === undefined ? selected?.id : change.location;
    const show =
      change.show === undefined ? (lowOnly ? "low" : null) : change.show;
    if (location) params.set("location", location);
    if (show) params.set("show", show);
    const text = params.toString();
    return `${base}${text ? `?${text}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stock"
        sub={
          lowCount > 0
            ? `${lowCount} product${lowCount === 1 ? " is" : "s are"} running low.`
            : "What you have on hand right now."
        }
        actions={
          <Link href={`${base}/receive`} className={buttonClass("primary")}>
            + Receive stock
          </Link>
        }
      />
      <StockTabs base={`/b/${org.slug}`} current="on-hand" />

      <FilterBar>
        {hasSerials ? (
          <form
            method="get"
            action={`${base}/serials`}
            className="flex flex-wrap items-end gap-2"
            role="search"
          >
            <label className="min-w-0 flex-1 text-sm font-bold">
              Find a serial number
              <input
                type="search"
                name="q"
                autoComplete="off"
                placeholder="Type or scan a serial / IMEI"
                className={INPUT}
              />
            </label>
            <button type="submit" className={buttonClass("secondary")}>
              Find
            </button>
          </form>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <StatusTabs
            label="Which products"
            current={lowOnly ? "low" : "all"}
            hrefFor={(value) => href({ show: value === "low" ? "low" : null })}
            tabs={[
              { value: "all", label: "All products", count: allRows.length },
              { value: "low", label: "Running low", count: lowCount },
            ]}
          />
          {locations.length > 1 ? (
            <StatusTabs
              label="Location"
              current={selected?.id ?? "all"}
              hrefFor={(value) =>
                href({ location: value === "all" ? null : value })
              }
              tabs={[
                { value: "all", label: "All locations" },
                ...locations.map((location) => ({
                  value: location.id,
                  label: location.name,
                })),
              ]}
            />
          ) : null}
        </div>
      </FilterBar>

      {allRows.length === 0 ? (
        <EmptyState title="No products yet">
          Add your products first, then record the stock you have.
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title="Nothing is running low">
          Every product is above its warning level.
        </EmptyState>
      ) : (
        groups.map(([title, groupRows]) => (
          <TableCard key={title ?? "all"} title={title ?? undefined}>
            <DataTable
              label={title ?? "Stock"}
              rows={groupRows}
              rowKey={(row) => row.productId}
              rowHref={
                manager
                  ? (row) => `/b/${org.slug}/products/${row.productId}`
                  : undefined
              }
              footer={
                groupRows.length > 1 ? (
                  <tr>
                    <td data-phone="title" className="px-5 py-3 font-extrabold">
                      Total
                    </td>
                    <td data-phone="hide" />
                    <td
                      data-phone="badge"
                      className="px-4 py-3 text-right text-lg font-extrabold tabular-nums"
                    >
                      {formatQuantity(
                        groupRows.reduce((sum, row) => sum + row.onHand, 0),
                      )}
                    </td>
                    <td data-phone="hide" />
                    <td data-phone="hide" />
                  </tr>
                ) : null
              }
              columns={[
                {
                  header: "Product",
                  wrap: true,
                  cell: (row) => (
                    <>
                      {row.name}
                      {breakdown.has(row.productId) ? (
                        <span className="block text-sm font-medium text-ink-soft">
                          {[...breakdown.get(row.productId)!.entries()]
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([label, count]) => `${label} ×${count}`)
                            .join(" · ")}
                        </span>
                      ) : null}
                    </>
                  ),
                },
                { header: "Unit", phone: "hide", cell: (row) => row.unit },
                {
                  header: "On hand",
                  align: "right",
                  phone: "badge",
                  cell: (row) => (
                    <>
                      <span className="text-xl font-extrabold">
                        {formatQuantity(row.onHand)}
                      </span>
                      <span className="ml-1 text-sm font-medium text-ink-soft md:hidden">
                        {row.unit}
                      </span>
                    </>
                  ),
                },
                {
                  header: "Warn at",
                  align: "right",
                  phone: "hide",
                  cell: (row) =>
                    row.lowLevel > 0 ? (
                      formatQuantity(row.lowLevel)
                    ) : (
                      <span className="text-ink-soft">—</span>
                    ),
                },
                {
                  header: "Status",
                  cell: (row) =>
                    row.isLow ? (
                      <Badge tone="accent">Low stock</Badge>
                    ) : (
                      <Badge tone="success">OK</Badge>
                    ),
                },
              ]}
            />
          </TableCard>
        ))
      )}
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
