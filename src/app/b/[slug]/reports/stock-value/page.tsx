import type { Metadata } from "next";
import { Suspense } from "react";
import { ListCard, PageSkeleton, PageTitle } from "@/components/ui/card";
import { categoryOrder, formatMoney, formatQuantity } from "@/lib/format";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";
import { getStockRows } from "@/lib/stock";

export const metadata: Metadata = { title: "Stock value" };

const HEAD = "px-4 py-2.5 text-left text-xs font-extrabold uppercase tracking-wide text-ink-soft";
const CELL = "px-4 py-3 text-right tabular-nums";

/** What the stock on hand cost, by product and in total. Owners and admins only. */
async function StockValue({ params }: Pick<PageProps<"/b/[slug]/reports/stock-value">, "params">) {
  const { slug } = await params;
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);

  const [rows, costsResult, deliveredResult] = await Promise.all([
    getStockRows(supabase, org.id, null),
    supabase.from("product_costs").select("product_id, cost_price").eq("organization_id", org.id),
    // Every costed delivery line still standing, for the average cost of what came in.
    supabase
      .from("stock_receipt_item_costs")
      .select("unit_cost, stock_receipt_items!inner (product_id, quantity, stock_receipts!inner (voided_at))")
      .eq("organization_id", org.id)
      .is("stock_receipt_items.stock_receipts.voided_at", null)
      .limit(20000)
  ]);
  // As in Bilikis: the average buying cost over everything received, weighted
  // by quantity. A product with no costed delivery uses its current cost.
  const inbound = new Map<string, { quantity: number; cost: number }>();
  for (const row of deliveredResult.data ?? []) {
    const item = row.stock_receipt_items;
    if (!item) continue;
    const current = inbound.get(item.product_id) ?? { quantity: 0, cost: 0 };
    current.quantity += Number(item.quantity);
    current.cost += Number(item.quantity) * Number(row.unit_cost);
    inbound.set(item.product_id, current);
  }
  const productCosts = new Map((costsResult.data ?? []).map((row) => [row.product_id, Number(row.cost_price)]));
  const costs = new Map(
    rows.map((row) => {
      const received = inbound.get(row.productId);
      const average = received && received.quantity > 0 ? received.cost / received.quantity : null;
      return [row.productId, average ?? productCosts.get(row.productId) ?? null] as const;
    })
  );
  const valued = rows.map((row) => {
    const cost = costs.get(row.productId) ?? null;
    return { ...row, cost, value: cost === null ? null : cost * row.onHand };
  });
  const total = valued.reduce((sum, row) => sum + (row.value ?? 0), 0);
  const missingCost = valued.filter((row) => row.cost === null && row.onHand > 0).length;

  const groups: [string, typeof valued][] = org.sells_drinks
    ? [...new Set(valued.map((row) => row.category ?? "Other"))]
        .sort((x, y) => categoryOrder(x === "Other" ? null : x) - categoryOrder(y === "Other" ? null : y))
        .map((name) => [name, valued.filter((row) => (row.category ?? "Other") === name)])
    : [["All products", valued]];
  const money = (value: number) => formatMoney(value, org.currency_code);

  return (
    <div className="space-y-6">
      <PageTitle sub="What the stock you have now cost you, at the average buying cost of what you received.">
        Stock value
      </PageTitle>

      <div className="rounded-md bg-ink px-5 py-4 text-white">
        <p className="text-4xl font-extrabold leading-none tabular-nums">{money(total)}</p>
        <p className="mt-2 text-sm font-bold uppercase tracking-wide text-nav">Total stock value</p>
      </div>
      {missingCost > 0 ? (
        <p className="rounded-md border-2 border-accent bg-white px-4 py-3 font-semibold">
          {missingCost} product{missingCost === 1 ? " has" : "s have"} stock but no buying cost, so{" "}
          {missingCost === 1 ? "it is" : "they are"} not counted. Add the cost on the product.
        </p>
      ) : null}

      {groups.map(([title, groupRows]) => {
        const subtotal = groupRows.reduce((sum, row) => sum + (row.value ?? 0), 0);
        return (
          <ListCard key={title} title={`${title} · ${money(subtotal)}`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem]">
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className={HEAD}>Product</th>
                    <th scope="col" className={`${HEAD} text-right`}>On hand</th>
                    <th scope="col" className={`${HEAD} text-right`}>Average cost</th>
                    <th scope="col" className={`${HEAD} text-right`}>Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {groupRows.map((row) => (
                    <tr key={row.productId}>
                      <th scope="row" className="px-4 py-3 text-left font-extrabold">
                        {row.name} <span className="font-medium text-ink-soft">({row.unit})</span>
                      </th>
                      <td className={CELL}>{formatQuantity(row.onHand)}</td>
                      <td className={CELL}>{row.cost === null ? "—" : money(row.cost)}</td>
                      <td className={`${CELL} font-extrabold`}>{row.value === null ? "—" : money(row.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ListCard>
        );
      })}
    </div>
  );
}

export default function StockValuePage({ params }: PageProps<"/b/[slug]/reports/stock-value">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StockValue params={params} />
    </Suspense>
  );
}
