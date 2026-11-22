import type { Metadata } from "next";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, CardHeader, PageSkeleton } from "@/components/ui/card";
import { DataTable, TableCard } from "@/components/ui/data-table";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { SummaryCard, SummaryCards } from "@/components/ui/summary-card";
import {
  categoryOrder,
  formatDay,
  formatMoney,
  formatQuantity,
  todayIn,
} from "@/lib/format";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";
import {
  getSavedProductOrder,
  sortByProductMasterOrder,
} from "@/lib/product-order";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Inventory value" };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const INPUT =
  "mt-1.5 block min-h-12 w-full rounded-md border-2 border-field bg-white px-3 text-base font-medium focus:border-ink focus:outline-2 focus:outline-accent";

/**
 * Bilikis's Inventory Value: what the stock on hand cost, as at the close of
 * any day, by category and by product. Each product is valued at the average
 * buying cost of what was received up to that day, weighted by quantity; one
 * with no costed delivery uses its current cost. Owners and admins only.
 */
async function StockValue({
  params,
  searchParams,
}: PageProps<"/b/[slug]/reports/stock-value">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { supabase, org, t } = await requireOrg(slug, MANAGER_ROLES);
  const today = todayIn(org.timezone, await requestNow());
  const asked = typeof query.asAt === "string" ? query.asAt : "";
  const asAt = DAY.test(asked) && asked <= today ? asked : today;
  const historical = asAt !== today;
  const drinks = org.sells_drinks;

  const [stockResult, costsResult, deliveredResult, saved] = await Promise.all([
    supabase.rpc("stock_summary", { p_organization_id: org.id, p_date: asAt }),
    supabase
      .from("product_costs")
      .select("product_id, cost_price")
      .eq("organization_id", org.id),
    // Every costed delivery line still standing up to that day.
    supabase
      .from("stock_receipt_item_costs")
      .select(
        "unit_cost, stock_receipt_items!inner (product_id, quantity, stock_receipts!inner (voided_at, received_date))",
      )
      .eq("organization_id", org.id)
      .is("stock_receipt_items.stock_receipts.voided_at", null)
      .lte("stock_receipt_items.stock_receipts.received_date", asAt)
      .limit(20000),
    drinks ? getSavedProductOrder(supabase, org.id) : Promise.resolve([] as string[]),
  ]);
  const error = stockResult.error ?? costsResult.error ?? deliveredResult.error;
  if (error) console.error("Inventory value could not load:", error);

  const inbound = new Map<string, { quantity: number; cost: number }>();
  for (const row of deliveredResult.data ?? []) {
    const item = row.stock_receipt_items;
    if (!item) continue;
    const current = inbound.get(item.product_id) ?? { quantity: 0, cost: 0 };
    current.quantity += Number(item.quantity);
    current.cost += Number(item.quantity) * Number(row.unit_cost);
    inbound.set(item.product_id, current);
  }
  const productCosts = new Map(
    (costsResult.data ?? []).map((row) => [row.product_id, Number(row.cost_price)]),
  );
  const stock = stockResult.data ?? [];
  const rows = (drinks ? sortByProductMasterOrder(stock, saved) : stock).map((row) => {
    const received = inbound.get(row.product_id);
    const average =
      received && received.quantity > 0 ? received.cost / received.quantity : null;
    const cost = average ?? productCosts.get(row.product_id) ?? null;
    const onHand = Number(row.in_stock);
    const category = drinks
      ? row.returnable
        ? "RGB"
        : (row.category ?? "PET")
      : (row.category ?? "Other");
    return {
      id: row.product_id,
      code: row.sku,
      name: row.name,
      unit: row.unit,
      category,
      onHand,
      cost,
      value: onHand > 0 && cost !== null ? onHand * cost : null,
      status:
        onHand < 0
          ? "Negative stock"
          : onHand === 0
            ? "No stock"
            : cost === null
              ? "Cost missing"
              : "Valued",
    };
  });
  const total = rows.reduce((sum, row) => sum + (row.value ?? 0), 0);
  const valuedCount = rows.filter((row) => row.value !== null).length;
  const missingCost = rows.filter((row) => row.status === "Cost missing").length;
  const categories = [...new Set(rows.map((row) => row.category))]
    .sort(
      (x, y) =>
        categoryOrder(x === "Other" ? null : x) -
          categoryOrder(y === "Other" ? null : y) || x.localeCompare(y),
    )
    .map((category) => ({
      category,
      total: rows
        .filter((row) => row.category === category)
        .reduce((sum, row) => sum + (row.value ?? 0), 0),
    }));
  const money = (value: number) => formatMoney(value, org.currency_code);
  const date = formatDay(asAt);

  return (
    <div className="space-y-5">
      <PageHeader
        title={drinks ? "Inventory value" : "Stock value"}
        sub="Review the cost value of the stock in the depot, by category and product."
      />
      <SummaryCards columns={3}>
        <SummaryCard
          label="Total inventory value"
          value={error ? "Unavailable" : money(total)}
          strong
        />
        <SummaryCard
          label="Valued products"
          value={error ? "Unavailable" : formatQuantity(valuedCount)}
        />
        <SummaryCard
          label="Products missing cost"
          value={error ? "Unavailable" : formatQuantity(missingCost)}
        />
      </SummaryCards>

      <Card>
        <CardHeader
          title="Value as at"
          description="Choose a date to value the stock held at the close of that day."
        />
        <form
          method="get"
          action={`/b/${org.slug}/reports/stock-value`}
          className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end"
        >
          <label className="block text-sm font-bold">
            Closing date
            <input
              className={INPUT}
              type="date"
              name="asAt"
              defaultValue={asAt}
              max={today}
            />
          </label>
          <button type="submit" className={buttonClass("primary")}>
            Apply
          </button>
        </form>
      </Card>

      {error ? (
        <Alert tone="error">
          The inventory value could not be loaded. Please refresh the page. If
          this keeps happening, the database may be missing its latest update.
        </Alert>
      ) : (
        <>
          {missingCost > 0 ? (
            <p className="rounded-md border-2 border-accent bg-white px-4 py-3 font-semibold">
              {missingCost} product{missingCost === 1 ? " has" : "s have"} stock
              but no buying cost, so {missingCost === 1 ? "it is" : "they are"}{" "}
              not counted. Add the cost on the product.
            </p>
          ) : null}
          <TableCard
            title={
              historical
                ? `Stock value by category as at ${date}`
                : "Current stock value by category"
            }
          >
            <p className="px-5 pt-3 text-sm text-ink-soft">
              Each figure uses the weighted-average cost of the stock received.
            </p>
            <div className="grid grid-cols-2 gap-3 p-5 xl:grid-cols-4">
              {categories.map(({ category, total: value }) => (
                <div
                  key={category}
                  data-summary-card
                  className="rounded-md border-2 border-line px-4 py-3"
                >
                  <p className="text-sm font-bold uppercase tracking-wide text-ink-soft">
                    {t(category)} stock value
                  </p>
                  <p className="mt-1.5 text-2xl font-extrabold tabular-nums">
                    {money(value)}
                  </p>
                </div>
              ))}
            </div>
          </TableCard>
          <TableCard
            title={
              historical
                ? `Product value as at ${date}`
                : "Current stock value by product"
            }
          >
            <p className="px-5 pt-3 text-sm text-ink-soft">
              Products with stock but no buying cost stay listed and are marked
              for follow-up.
            </p>
            <DataTable
              label="Product value"
              rows={rows}
              rowKey={(row) => row.id}
              empty="No stock yet. Receive stock with its buying cost to start valuing it."
              columns={[
                { header: "Product code", cell: (row) => row.code ?? "—" },
                { header: "Product name", wrap: true, cell: (row) => row.name },
                { header: "Category", cell: (row) => t(row.category) },
                { header: "Unit", cell: (row) => row.unit },
                {
                  header: "Current stock",
                  align: "right",
                  cell: (row) => formatQuantity(row.onHand),
                },
                {
                  header: "Weighted avg cost",
                  align: "right",
                  cell: (row) => (row.cost === null ? "—" : money(row.cost)),
                },
                {
                  header: "Stock value",
                  align: "right",
                  cell: (row) => (
                    <span className="font-extrabold">
                      {row.value === null ? "—" : money(row.value)}
                    </span>
                  ),
                },
                {
                  header: "Status",
                  phone: "badge",
                  cell: (row) => (
                    <Badge
                      tone={
                        row.status === "Valued"
                          ? "success"
                          : row.status === "No stock"
                            ? "plain"
                            : "danger"
                      }
                    >
                      {row.status}
                    </Badge>
                  ),
                },
              ]}
            />
          </TableCard>
        </>
      )}
    </div>
  );
}

export default function StockValuePage(
  props: PageProps<"/b/[slug]/reports/stock-value">,
) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StockValue {...props} />
    </Suspense>
  );
}
