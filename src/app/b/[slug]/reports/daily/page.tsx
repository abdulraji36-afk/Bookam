import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { buttonClass } from "@/components/ui/button";
import { ListCard, PageSkeleton, PageTitle } from "@/components/ui/card";
import { DataTable, TableCard } from "@/components/ui/data-table";
import { formatDay, formatMoney, formatQuantity, todayIn } from "@/lib/format";
import { canManage, requireOrg } from "@/lib/org";
import { saleWords } from "@/lib/selling";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Daily report" };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function shiftDay(isoDay: string, days: number) {
  const date = new Date(`${isoDay}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-md px-5 py-4 ${strong ? "bg-ink text-white" : "bg-white"}`}>
      <p className="text-3xl font-extrabold leading-none tabular-nums sm:text-4xl">{value}</p>
      <p className={`mt-2 text-sm font-bold uppercase tracking-wide ${strong ? "text-nav" : "text-ink-soft"}`}>
        {label}
      </p>
    </div>
  );
}

const HEAD = "px-4 py-2.5 text-left text-xs font-extrabold uppercase tracking-wide text-ink-soft";
const CELL = "px-4 py-3 tabular-nums";

async function DailyReport({ params, searchParams }: PageProps<"/b/[slug]/reports/daily">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { supabase, org, role } = await requireOrg(slug);
  const words = saleWords(org.selling_mode);
  const base = `/b/${org.slug}`;
  const today = todayIn(org.timezone, await requestNow());
  const asked = typeof query.date === "string" && DAY.test(query.date) ? query.date : today;
  const day = asked > today ? today : asked;
  // Staff see quantities only; money is for owners and admins.
  const showMoney = canManage(role);

  const [stock, returnables, orders, trips, receipts, waiting, loading, out, deliveries, emptiesMoves, shortages] = await Promise.all([
    supabase.rpc("daily_stock_report", { p_organization_id: org.id, p_date: day }),
    supabase.rpc("daily_returnables_report", { p_organization_id: org.id, p_date: day }),
    supabase
      .from("order_summaries")
      .select("id, order_no, status, customer_name, total_quantity, total_amount, voided_at")
      .eq("organization_id", org.id)
      .eq("order_date", day)
      .order("created_at"),
    supabase
      .from("dispatch_trip_summaries")
      .select("id, trip_no, driver_name, order_count, total_quantity")
      .eq("organization_id", org.id)
      .eq("dispatch_date", day)
      .in("status", ["dispatched", "completed"])
      .order("created_at"),
    supabase
      .from("stock_receipts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("received_date", day)
      .is("voided_at", null),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("status", "pending"),
    supabase.from("dispatch_trips").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("status", "draft"),
    supabase.from("dispatch_trips").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("status", "dispatched"),
    // Bilikis-style detail: each delivery, with the empties given back on it.
    supabase
      .from("stock_receipts")
      .select("id, receipt_no, supplier_name, reference, stock_receipt_items (quantity), supplier_exchanges (quantity_taken, voided_at)")
      .eq("organization_id", org.id)
      .eq("received_date", day)
      .is("voided_at", null)
      .order("created_at"),
    org.tracks_returns
      ? supabase
          .from("returnable_movements")
          .select("movement_type, customer_id, holding_delta, owed_delta")
          .eq("organization_id", org.id)
          .eq("movement_date", day)
      : Promise.resolve({ data: [], error: null }),
    org.tracks_returns
      ? supabase.from("customer_returnable_balances").select("owed").eq("organization_id", org.id).gt("owed", 0)
      : Promise.resolve({ data: [], error: null })
  ]);

  // Empties in and out on the day, by where they came from or went.
  const moves = emptiesMoves.data ?? [];
  const sumHolding = (keep: (move: (typeof moves)[number]) => boolean) =>
    moves.filter(keep).reduce((sum, move) => sum + Number(move.holding_delta), 0);
  const emptiesLines: [string, number][] = [
    ["Came back with trips", sumHolding((move) => move.movement_type === "trip_return")],
    [
      "Customers brought back at the depot",
      sumHolding((move) => move.movement_type === "adjustment" && move.customer_id !== null && Number(move.holding_delta) > 0)
    ],
    [
      "Opening count, purchases and corrections",
      sumHolding((move) => move.movement_type === "adjustment" && !(move.customer_id !== null && Number(move.holding_delta) > 0))
    ],
    ["Taken by the supplier", sumHolding((move) => move.movement_type === "supplier_exchange")]
  ];
  const owedNew = moves
    .filter((move) => move.movement_type === "dispatch")
    .reduce((sum, move) => sum + Number(move.owed_delta), 0);
  const shortageRows = shortages.data ?? [];
  const shortageTotal = shortageRows.reduce((sum, row) => sum + Number(row.owed), 0);
  const deliveryRows = deliveries.data ?? [];

  const stockRows = stock.data ?? [];
  // Write-offs are no longer made; the column only shows for a day that has an old one.
  const showAdjusted = stockRows.some((row) => Number(row.adjusted) !== 0);
  const returnableRows = returnables.data ?? [];
  const orderRows = orders.data ?? [];
  const tripRows = trips.data ?? [];
  const counted = orderRows.filter((order) => order.status !== "cancelled");
  const soldQuantity = counted.reduce((sum, order) => sum + Number(order.total_quantity), 0);
  const soldValue = counted.reduce((sum, order) => sum + Number(order.total_amount), 0);
  const failed = stock.error || returnables.error || orders.error || trips.error;

  return (
    <div className="space-y-6">
      <div className="page-head">
        <PageTitle sub={day === today ? "Today so far." : "What happened on this day."}>
          {formatDay(day)}
        </PageTitle>
        <div className="flex flex-wrap items-end gap-2">
          {showMoney ? (
            <Link href={`${base}/reports/stock-value`} className={buttonClass("ghost", "sm")}>
              Stock value
            </Link>
          ) : null}
          <Link href={`${base}/reports/daily?date=${shiftDay(day, -1)}`} className={buttonClass("secondary", "sm")}>
            Previous day
          </Link>
          {day < today ? (
            <Link href={`${base}/reports/daily?date=${shiftDay(day, 1)}`} className={buttonClass("secondary", "sm")}>
              Next day
            </Link>
          ) : null}
          <form method="get" className="flex items-end gap-2">
            <label className="text-sm font-bold">
              Go to date
              <input
                type="date"
                name="date"
                defaultValue={day}
                max={today}
                className="mt-1 block min-h-11 rounded-md border-2 border-field bg-white px-3 text-base font-medium"
              />
            </label>
            <button type="submit" className={buttonClass("primary", "sm")}>
              Show
            </button>
          </form>
        </div>
      </div>

      {failed ? (
        <p role="alert" className="rounded-md border-2 border-danger bg-danger-soft px-4 py-3 font-semibold text-danger">
          Part of this report could not be loaded, so nothing is shown. Refresh to try again.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Figure label={`${words.Many} recorded`} value={String(counted.length)} strong />
            <Figure label={words.one === "sale" ? "Items sold" : "Items ordered"} value={formatQuantity(soldQuantity)} />
            {showMoney ? (
              <Figure label={`${words.One} value`} value={formatMoney(soldValue, org.currency_code)} />
            ) : (
              <Figure label="Trips sent out" value={String(tripRows.length)} />
            )}
            <Figure label="Deliveries received" value={String(receipts.count ?? 0)} />
          </div>

          <ListCard title="Stock">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[42rem]">
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className={HEAD}>Product</th>
                    <th scope="col" className={`${HEAD} text-right`}>Opening</th>
                    <th scope="col" className={`${HEAD} text-right`}>Received</th>
                    <th scope="col" className={`${HEAD} text-right`}>Ordered out</th>
                    {showAdjusted ? (
                      <th scope="col" className={`${HEAD} text-right`}>Written off / corrected</th>
                    ) : null}
                    <th scope="col" className={`${HEAD} text-right`}>Closing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {stockRows.map((row) => (
                    <tr key={row.product_id}>
                      <th scope="row" className="px-4 py-3 text-left font-extrabold">
                        {row.name} <span className="font-medium text-ink-soft">({row.unit})</span>
                      </th>
                      <td className={`${CELL} text-right`}>{formatQuantity(Number(row.opening))}</td>
                      <td className={`${CELL} text-right`}>{formatQuantity(Number(row.received))}</td>
                      <td className={`${CELL} text-right`}>{formatQuantity(Number(row.sold))}</td>
                      {showAdjusted ? (
                        <td className={`${CELL} text-right`}>
                          {Number(row.adjusted) > 0 ? "+" : Number(row.adjusted) < 0 ? "−" : ""}
                          {formatQuantity(Math.abs(Number(row.adjusted)))}
                        </td>
                      ) : null}
                      <td className={`${CELL} text-right text-lg font-extrabold`}>{formatQuantity(Number(row.closing))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {stockRows.length === 0 ? <p className="px-5 py-4 font-medium text-ink-soft">No products yet.</p> : null}
          </ListCard>

          {returnableRows.length > 0 ? (
            <ListCard title={org.sells_drinks ? "Empties count" : "Returnables"}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[38rem]">
                  <thead>
                    <tr className="border-b border-line">
                      <th scope="col" className={HEAD}>Item</th>
                      <th scope="col" className={`${HEAD} text-right`}>Opening</th>
                      <th scope="col" className={`${HEAD} text-right`}>Came in</th>
                      <th scope="col" className={`${HEAD} text-right`}>Went out</th>
                      <th scope="col" className={`${HEAD} text-right`}>In store at close</th>
                      <th scope="col" className={`${HEAD} text-right`}>Owed at close</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {returnableRows.map((row) => (
                      <tr key={row.returnable_item_id}>
                        <th scope="row" className="px-4 py-3 text-left font-extrabold">{row.name}</th>
                        <td className={`${CELL} text-right`}>{formatQuantity(Number(row.opening))}</td>
                        <td className={`${CELL} text-right`}>{formatQuantity(Number(row.came_in))}</td>
                        <td className={`${CELL} text-right`}>{formatQuantity(Number(row.went_out))}</td>
                        <td className={`${CELL} text-right text-lg font-extrabold`}>{formatQuantity(Number(row.closing))}</td>
                        <td className={`${CELL} text-right text-lg font-extrabold`}>{formatQuantity(Number(row.owed_closing))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ListCard>
          ) : null}

          <TableCard title={`Deliveries received (${deliveryRows.length})`}>
            <DataTable
              label="Deliveries received"
              rows={deliveryRows}
              rowKey={(delivery) => delivery.id}
              rowHref={(delivery) => `${base}/stock/receipts/${delivery.id}`}
              empty="No stock was received on this day."
              columns={[
                { header: "Delivery no.", cell: (delivery) => <span className="tabular-nums">{delivery.receipt_no}</span> },
                { header: "Supplier", wrap: true, cell: (delivery) => delivery.supplier_name ?? <span className="text-ink-soft">—</span> },
                { header: "Reference", cell: (delivery) => delivery.reference ?? <span className="text-ink-soft">—</span> },
                {
                  header: "Items",
                  align: "right",
                  phone: "badge",
                  cell: (delivery) => `+${formatQuantity(delivery.stock_receipt_items.reduce((sum, item) => sum + Number(item.quantity), 0))}`
                },
                ...(org.tracks_returns
                  ? [
                      {
                        header: org.sells_drinks ? "Empties given back" : "Returnables given back",
                        align: "right" as const,
                        cell: (delivery: (typeof deliveryRows)[number]) =>
                          delivery.supplier_exchanges && !delivery.supplier_exchanges.voided_at
                            ? formatQuantity(Number(delivery.supplier_exchanges.quantity_taken))
                            : <span className="text-ink-soft">—</span>
                      }
                    ]
                  : [])
              ]}
            />
          </TableCard>

          {org.tracks_returns ? (
            <ListCard title={org.sells_drinks ? "Empties in and out" : "Returnables in and out"}>
              <ul className="divide-y divide-line">
                {emptiesLines.map(([label, value]) => (
                  <li key={label} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span className="font-semibold">{label}</span>
                    <span className="text-xl font-extrabold tabular-nums">
                      {value > 0 ? "+" : value < 0 ? "−" : ""}
                      {formatQuantity(Math.abs(value))}
                    </span>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-3 px-5 py-3 text-ink-soft">
                  <span className="font-semibold">Sent out with orders, now owed by customers</span>
                  <span className="text-xl font-extrabold tabular-nums">{formatQuantity(owedNew)}</span>
                </li>
              </ul>
            </ListCard>
          ) : null}

          <TableCard title={`${words.Many} recorded (${orderRows.length})`}>
            <DataTable
              label={`${words.Many} recorded`}
              rows={orderRows}
              rowKey={(order) => order.id}
              rowHref={(order) => `${base}/orders/${order.id}`}
              empty={`No ${words.many} were recorded on this day.`}
              columns={[
                { header: "Customer", wrap: true, cell: (order) => order.customer_name },
                {
                  header: "Status",
                  phone: "badge",
                  cell: (order) => <OrderStatusBadge status={order.status} voided={Boolean(order.voided_at)} delivers={org.does_delivery} />
                },
                { header: `${words.One} no.`, cell: (order) => <span className="tabular-nums">{order.order_no}</span> },
                { header: "Items", align: "right", cell: (order) => formatQuantity(Number(order.total_quantity)) },
                ...(showMoney
                  ? [
                      {
                        header: "Value",
                        align: "right" as const,
                        cell: (order: (typeof orderRows)[number]) => formatMoney(Number(order.total_amount), org.currency_code)
                      }
                    ]
                  : [])
              ]}
            />
          </TableCard>

          <TableCard title={`Trips sent out (${tripRows.length})`}>
            <DataTable
              label="Trips sent out"
              rows={tripRows}
              rowKey={(trip) => trip.id}
              rowHref={(trip) => `${base}/dispatch/${trip.id}`}
              empty="No trips left on this day."
              columns={[
                { header: "Driver", cell: (trip) => trip.driver_name },
                { header: "Trip no.", cell: (trip) => <span className="tabular-nums">{trip.trip_no}</span> },
                { header: "Orders", align: "right", cell: (trip) => trip.order_count },
                { header: "Items", align: "right", phone: "badge", cell: (trip) => formatQuantity(Number(trip.total_quantity)) }
              ]}
            />
          </TableCard>

          <ListCard title="Still open right now">
            <ul className="divide-y divide-line">
              {[
                ["Orders waiting for dispatch", waiting.count ?? 0, `${base}/orders`],
                ["Trips being loaded", loading.count ?? 0, `${base}/dispatch`],
                ["Trips out, returns not yet recorded", out.count ?? 0, `${base}/returns`],
                ...(org.tracks_returns
                  ? [
                      [
                        `${org.sells_drinks ? "Empty shortages" : "Customers owing returnables"}: ${shortageRows.length} customer${shortageRows.length === 1 ? "" : "s"}`,
                        shortageTotal,
                        `${base}/returns`
                      ]
                    ]
                  : [])
              ].map(([label, count, href]) => (
                <li key={String(label)}>
                  <Link href={String(href)} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-paper">
                    <span className="font-semibold">{label}</span>
                    <span className="text-2xl font-extrabold tabular-nums">{count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </ListCard>
        </>
      )}
    </div>
  );
}

export default function DailyReportPage(props: PageProps<"/b/[slug]/reports/daily">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DailyReport {...props} />
    </Suspense>
  );
}
