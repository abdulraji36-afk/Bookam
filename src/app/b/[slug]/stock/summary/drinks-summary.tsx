import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/card";
import { DataTable, TableCard } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { SummaryCard } from "@/components/ui/summary-card";
import { buttonClass } from "@/components/ui/button";
import { categoryOrder, formatDay, formatQuantity } from "@/lib/format";
import { sortByProductMasterOrder } from "@/lib/product-order";
import type { Database } from "@/types/database";

type StockRow =
  Database["public"]["Functions"]["stock_summary"]["Returns"][number];
type EmptiesRow =
  Database["public"]["Functions"]["empties_summary"]["Returns"][number];

const INPUT =
  "mt-1.5 block min-h-12 w-full rounded-md border-2 border-field bg-white px-3 text-base font-medium focus:border-ink focus:outline-2 focus:outline-accent";

/** As in Bilikis: Low Stock at 10 or fewer, unless the product has its own warning level. */
function stockStatus(row: StockRow) {
  const stock = Number(row.in_stock);
  const lowLevel =
    Number(row.low_stock_threshold) > 0 ? Number(row.low_stock_threshold) : 10;
  if (stock < 0) return { label: "Negative", tone: "danger" as const };
  if (stock === 0) return { label: "Out of Stock", tone: "danger" as const };
  if (stock <= lowLevel) return { label: "Low Stock", tone: "accent" as const };
  return { label: "OK", tone: "success" as const };
}

/** Bilikis's category of a drink: RGB for crates, otherwise its category. */
const categoryOf = (row: StockRow) =>
  row.returnable ? "RGB" : (row.category ?? "PET");

/**
 * The Bilikis Stock Summary, for a drinks depot. Owners and admins see the
 * admin cards (with the empties figures); staff see stock by category and
 * the total empties in the depot. Below: the closing date, then every
 * product's total in, total out and current stock as at that day.
 */
export function DrinksStockSummary({
  base,
  day,
  today,
  manager,
  rows: unsorted,
  saved,
  empties,
  error,
  t,
}: {
  t: (text: string) => string;
  base: string;
  day: string;
  today: string;
  manager: boolean;
  rows: StockRow[];
  saved: string[];
  empties: EmptiesRow | null;
  error: boolean;
}) {
  const rows = sortByProductMasterOrder(unsorted, saved);
  const value = (number: number) =>
    error ? "Unavailable" : formatQuantity(number);
  const categoryTotal = (category: string) =>
    rows
      .filter((row) => categoryOf(row).toLowerCase() === category.toLowerCase())
      .reduce((total, row) => total + Number(row.in_stock), 0);
  const lowCount = rows.filter((row) => stockStatus(row).label !== "OK").length;
  const signed = (number: number) =>
    number > 0
      ? `+${formatQuantity(number)}`
      : number < 0
        ? `−${formatQuantity(-number)}`
        : "0";

  const cards: [string, string, boolean?][] = manager
    ? [
        ["Tracked products", value(rows.length)],
        ["Low stock", value(lowCount)],
        [
          "Trip empties returned",
          empties
            ? formatQuantity(
                Number(empties.trip_returns) + Number(empties.followups),
              )
            : "Unavailable",
        ],
        [
          "Empties given to supplier",
          empties
            ? formatQuantity(Number(empties.taken_by_supplier))
            : "Unavailable",
        ],
        [
          "Adjustments",
          empties ? signed(Number(empties.adjustments)) : "Unavailable",
        ],
        [
          "Current empty balance",
          empties ? formatQuantity(Number(empties.in_store)) : "Unavailable",
          true,
        ],
      ]
    : [
        ["Tracked products", value(rows.length)],
        // One card per category the business has: RGB and PET first, then
        // the usual ones, then its own (Beer, Malt...).
        ...[...new Set(rows.map(categoryOf))]
          .sort((x, y) => categoryOrder(x) - categoryOrder(y) || x.localeCompare(y))
          .map((category): [string, string] => [t(`${category} stock`), value(categoryTotal(category))]),
      ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stock summary"
        sub={
          manager
            ? t("Review stock levels and the empty balance.")
            : "Check current stock before selling."
        }
      />

      <div
        className={`grid grid-cols-2 gap-3 ${manager ? "xl:grid-cols-6 lg:grid-cols-3" : "lg:grid-cols-3 xl:grid-cols-6"}`}
      >
        {cards.map(([label, number, strong]) => (
          <SummaryCard
            key={label}
            label={t(label)}
            value={number}
            strong={strong}
          />
        ))}
      </div>
      {manager ? null : (
        <SummaryCard
          label={t("Total empties in depot")}
          value={
            empties ? formatQuantity(Number(empties.in_store)) : "Unavailable"
          }
          strong
        />
      )}

      <Card>
        <CardHeader
          title="Stock as at"
          description={
            manager
              ? t("Choose a date to see stock and empty balances at the close of that day.")
              : "Choose a date to see the stock balance at the close of that day."
          }
        />
        <form
          method="get"
          action={`${base}/stock/summary`}
          className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end"
        >
          <label className="block text-sm font-bold">
            Closing date
            <input
              className={INPUT}
              type="date"
              name="date"
              defaultValue={day}
              max={today}
            />
          </label>
          <button type="submit" className={buttonClass("primary")}>
            Apply
          </button>
        </form>
      </Card>

      <TableCard title={`Stock by product as at ${formatDay(day)}`}>
        <p className="px-5 pt-3 text-sm text-ink-soft">
          Calculated from stock movements dated on or before this closing date.
        </p>
        {error ? (
          <div className="p-5">
            <EmptyState title="Stock summary could not load">
              Please refresh the page.
            </EmptyState>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No stock data yet">
              Post a stock-in transaction first, then the inventory summary will
              appear here.
            </EmptyState>
          </div>
        ) : (
          <DataTable
            label="Stock by product"
            rows={rows}
            rowKey={(row) => row.product_id}
            rowHref={
              manager
                ? (row) => `${base}/products/${row.product_id}`
                : undefined
            }
            columns={[
              {
                header: "Product code",
                phone: "hide",
                cell: (row) => (
                  <span className="font-bold">{row.sku ?? "—"}</span>
                ),
              },
              { header: "Product name", wrap: true, phone: "title", cell: (row) => row.name },
              {
                header: "Total in",
                align: "right",
                cell: (row) => formatQuantity(Number(row.total_in)),
              },
              {
                header: "Total out",
                align: "right",
                cell: (row) => formatQuantity(Number(row.total_out)),
              },
              {
                header: "Current stock",
                align: "right",
                phone: "badge",
                cell: (row) => (
                  <span
                    data-current-stock
                    className="text-lg font-extrabold tabular-nums"
                  >
                    {formatQuantity(Number(row.in_stock))}
                  </span>
                ),
              },
              { header: "Category", cell: (row) => t(categoryOf(row)) },
              { header: "Unit", cell: (row) => row.unit },
              {
                header: "Status",
                cell: (row) => {
                  const status = stockStatus(row);
                  return <Badge tone={status.tone}>{status.label}</Badge>;
                },
              },
            ]}
          />
        )}
      </TableCard>
    </div>
  );
}
