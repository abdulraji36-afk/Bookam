import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { Badge, EmptyState, PageSkeleton } from "@/components/ui/card";
import { DataTable, TableCard } from "@/components/ui/data-table";
import { FilterBar, PageHeader, StatusTabs } from "@/components/ui/page-header";
import {
  categoryOrder,
  formatDay,
  formatQuantity,
  todayIn,
} from "@/lib/format";
import { canManage, requireOrg } from "@/lib/org";
import { requestNow } from "@/lib/request-time";
import { DrinksStockSummary } from "./drinks-summary";

export const metadata: Metadata = { title: "Stock summary" };

const INPUT =
  "mt-1.5 block min-h-12 w-full rounded-md border-2 border-field bg-white px-3 text-base font-medium placeholder:font-normal placeholder:text-ink-soft/70 focus:border-ink focus:outline-2 focus:outline-accent";

type Row = {
  productId: string;
  name: string;
  sku: string | null;
  unit: string;
  category: string | null;
  returnable: boolean;
  tracksSerials: boolean;
  onHand: number;
  lowLevel: number;
  isLow: boolean;
};

function Figure({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`rounded-md px-5 py-4 ${strong ? "bg-ink text-white" : "bg-white"}`}
    >
      <p className="text-3xl font-extrabold leading-none tabular-nums sm:text-4xl">
        {value}
      </p>
      <p
        className={`mt-2 text-sm font-bold uppercase tracking-wide ${strong ? "text-nav" : "text-ink-soft"}`}
      >
        {label}
      </p>
    </div>
  );
}

/**
 * Everything in the depot at the close of a chosen day (today by default), as
 * in Bilikis: each product's stock from the stock ledger, and the empties.
 *
 *   Stock of a product = qty in - qty out, movements dated on or before the day
 *   Empties in store   = opening + trip returns + follow-ups + adjustments - taken by the supplier
 */
async function StockSummary({
  params,
  searchParams,
}: PageProps<"/b/[slug]/stock/summary">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { supabase, org, role } = await requireOrg(slug);
  const base = `/b/${org.slug}`;
  const manager = canManage(role);
  const today = todayIn(org.timezone, await requestNow());
  const asked =
    typeof query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.date)
      ? query.date
      : today;
  const day = asked > today ? today : asked;
  const isToday = day === today;
  const lowOnly = query.show === "low";

  const { data: locationData } = await supabase
    .from("locations")
    .select("id, name")
    .eq("organization_id", org.id)
    .eq("is_active", true)
    .order("created_at");
  const locations = locationData ?? [];
  const selected =
    locations.find((location) => location.id === query.location) ?? null;

  let unitQuery = supabase
    .from("product_units")
    .select("product_id, colour")
    .eq("organization_id", org.id)
    .eq("status", "in_stock")
    .limit(10000);
  if (selected) unitQuery = unitQuery.eq("location_id", selected.id);

  const [stockResult, emptiesResult, unitsResult] = await Promise.all([
    supabase.rpc("stock_summary", {
      p_organization_id: org.id,
      p_date: day,
      p_location_id: selected?.id ?? null,
    }),
    org.tracks_returns
      ? supabase.rpc("empties_summary", {
          p_organization_id: org.id,
          p_date: day,
          p_location_id: selected?.id ?? null,
        })
      : Promise.resolve({ data: [], error: null }),
    // Units on hand by colour are known for today only.
    isToday && org.tracks_serials
      ? unitQuery
      : Promise.resolve({ data: [], error: null }),
  ]);
  const loadError = stockResult.error ?? emptiesResult.error;
  if (loadError) console.error("Stock summary could not load:", loadError);

  // A drinks depot gets the Bilikis Stock Summary.
  if (org.sells_drinks) {
    return (
      <DrinksStockSummary
        base={base}
        day={day}
        today={today}
        manager={manager}
        rows={stockResult.data ?? []}
        empties={emptiesResult.error ? null : (emptiesResult.data?.[0] ?? null)}
        error={Boolean(stockResult.error)}
      />
    );
  }

  const allRows: Row[] = (stockResult.data ?? []).map((row) => {
    const onHand = Number(row.in_stock);
    const lowLevel = Number(row.low_stock_threshold);
    return {
      productId: row.product_id,
      name: row.name,
      sku: row.sku,
      unit: row.unit,
      category: row.category,
      returnable: row.returnable,
      tracksSerials: row.tracks_serials,
      onHand,
      lowLevel,
      isLow: lowLevel > 0 && onHand <= lowLevel,
    };
  });
  const rows = lowOnly ? allRows.filter((row) => row.isLow) : allRows;
  const lowCount = allRows.filter((row) => row.isLow).length;
  const inStockCount = allRows.filter((row) => row.onHand > 0).length;
  const empties = emptiesResult.data ?? [];
  const hasSerials =
    org.tracks_serials || allRows.some((row) => row.tracksSerials);

  // Serial-numbered products: how many of each colour.
  const breakdown = new Map<string, Map<string, number>>();
  for (const unit of unitsResult.data ?? []) {
    const label = unit.colour ?? "No colour";
    const counts = breakdown.get(unit.product_id) ?? new Map<string, number>();
    counts.set(label, (counts.get(label) ?? 0) + 1);
    breakdown.set(unit.product_id, counts);
  }

  const groups: [string | null, Row[]][] = org.sells_drinks
    ? // A drinks depot sees its stock by category, RGB first, as on the NBC list.
      [
        ...new Set(
          rows.map((row) =>
            row.returnable ? "RGB" : (row.category ?? "Other"),
          ),
        ),
      ]
        .sort(
          (x, y) =>
            categoryOrder(x === "Other" ? null : x) -
            categoryOrder(y === "Other" ? null : y),
        )
        .map(
          (name) =>
            [
              name,
              rows.filter(
                (row) =>
                  (row.returnable ? "RGB" : (row.category ?? "Other")) === name,
              ),
            ] as [string, Row[]],
        )
    : org.selling_mode === "serial"
      ? (
          [
            ["With serial numbers", rows.filter((row) => row.tracksSerials)],
            ["Counted items", rows.filter((row) => !row.tracksSerials)],
          ] as [string, Row[]][]
        ).filter(([, groupRows]) => groupRows.length > 0)
      : [[null, rows]];

  const sum = (keep: (row: Row) => boolean) =>
    allRows.filter(keep).reduce((total, row) => total + row.onHand, 0);
  const figures: [string, string, boolean?][] = org.sells_drinks
    ? [
        ["Products in stock", `${inStockCount} of ${allRows.length}`],
        ["Running low", formatQuantity(lowCount)],
        ["RGB crates", formatQuantity(sum((row) => row.returnable))],
        ["PET and others", formatQuantity(sum((row) => !row.returnable))],
      ]
    : [
        ["Products in stock", `${inStockCount} of ${allRows.length}`],
        ["Running low", formatQuantity(lowCount)],
        ["Items in stock", formatQuantity(sum(() => true))],
      ];
  if (empties[0])
    figures.push([
      `${empties[0].name} in store`,
      formatQuantity(Number(empties[0].in_store)),
      true,
    ]);

  const href = (change: { location?: string | null; show?: string | null }) => {
    const params = new URLSearchParams();
    const location =
      change.location === undefined ? selected?.id : change.location;
    const show =
      change.show === undefined ? (lowOnly ? "low" : null) : change.show;
    if (!isToday) params.set("date", day);
    if (location) params.set("location", location);
    if (show) params.set("show", show);
    const text = params.toString();
    return `${base}/stock/summary${text ? `?${text}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stock summary"
        sub={
          lowCount > 0
            ? `${lowCount} product${lowCount === 1 ? " is" : "s are"} running low.`
            : `Everything in ${org.sells_drinks ? "the depot" : "stock"} at the close of ${isToday ? "today" : formatDay(day)}.`
        }
        actions={
          <Link
            href={`${base}/stock/receive`}
            className={buttonClass("primary")}
          >
            + Receive stock
          </Link>
        }
      />

      <FilterBar>
        <form
          method="get"
          action={`${base}/stock/summary`}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="text-sm font-bold">
            At the close of
            <input
              type="date"
              name="date"
              defaultValue={day}
              max={today}
              className={INPUT}
            />
          </label>
          {selected ? (
            <input type="hidden" name="location" value={selected.id} />
          ) : null}
          {lowOnly ? <input type="hidden" name="show" value="low" /> : null}
          <button type="submit" className={buttonClass("secondary")}>
            Show
          </button>
          {isToday ? null : (
            <Link
              href={`${base}/stock/summary`}
              className={buttonClass("ghost")}
            >
              Back to today
            </Link>
          )}
        </form>
        {hasSerials && isToday ? (
          <form
            method="get"
            action={`${base}/stock/serials`}
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

      {loadError ? (
        <EmptyState title="The stock summary could not load">
          Please refresh the page.
        </EmptyState>
      ) : allRows.length === 0 ? (
        <EmptyState title="No products yet">
          Add your products first, then record the stock you have.
        </EmptyState>
      ) : (
        <>
          <div
            className={`grid grid-cols-2 gap-3 ${figures.length > 4 ? "lg:grid-cols-5" : "sm:grid-cols-4"}`}
          >
            {figures.map(([label, value, strong]) => (
              <Figure key={label} label={label} value={value} strong={strong} />
            ))}
          </div>

          {rows.length === 0 ? (
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
                      ? (row) => `${base}/products/${row.productId}`
                      : undefined
                  }
                  footer={
                    groupRows.length > 1 ? (
                      <tr>
                        <td
                          data-phone="title"
                          className="px-5 py-3 font-extrabold"
                        >
                          Total
                        </td>
                        <td data-phone="hide" />
                        <td
                          data-phone="badge"
                          className="px-4 py-3 text-right text-lg font-extrabold tabular-nums"
                        >
                          {formatQuantity(
                            groupRows.reduce(
                              (total, row) => total + row.onHand,
                              0,
                            ),
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
                          {row.sku ? (
                            <span className="block text-sm font-medium text-ink-soft">
                              {row.sku}
                            </span>
                          ) : null}
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
                      header: "In stock",
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

          {empties.map((item) => (
            <TableCard key={item.returnable_item_id} title={item.name}>
              <DataTable
                label={item.name}
                rows={
                  [
                    ["Back with trips", Number(item.trip_returns)],
                    ["Brought back later (follow-ups)", Number(item.followups)],
                    ["Opening count and adjustments", Number(item.adjustments)],
                    ["Taken by the supplier", -Number(item.taken_by_supplier)],
                  ].filter(
                    ([label, value]) =>
                      org.sells_drinks ||
                      label !== "Brought back later (follow-ups)" ||
                      value !== 0,
                  ) as [string, number][]
                }
                rowKey={([label]) => label}
                footer={
                  <tr>
                    <td
                      data-phone="title"
                      className="px-5 py-3 text-lg font-extrabold"
                    >
                      In store
                    </td>
                    <td
                      data-phone="badge"
                      className="px-5 py-3 text-right text-2xl font-extrabold tabular-nums"
                    >
                      {formatQuantity(Number(item.in_store))}
                    </td>
                  </tr>
                }
                columns={[
                  {
                    header: "Where they came from or went",
                    wrap: true,
                    cell: ([label]) => label,
                  },
                  {
                    header: "Empties",
                    align: "right",
                    phone: "badge",
                    cell: ([, value]) => (
                      <span className="font-extrabold tabular-nums">
                        {value > 0 ? "+" : value < 0 ? "−" : ""}
                        {formatQuantity(Math.abs(value))}
                      </span>
                    ),
                  },
                ]}
              />
            </TableCard>
          ))}
        </>
      )}
    </div>
  );
}

export default function StockSummaryPage(
  props: PageProps<"/b/[slug]/stock/summary">,
) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StockSummary {...props} />
    </Suspense>
  );
}
