import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { buttonClass } from "@/components/ui/button";
import { ListCard, PageSkeleton, PageTitle } from "@/components/ui/card";
import { formatDay, formatMoney, formatQuantity, todayIn } from "@/lib/format";
import { canManage, requireOrg } from "@/lib/org";
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
  const base = `/b/${org.slug}`;
  const today = todayIn(org.timezone, await requestNow());
  const asked = typeof query.date === "string" && DAY.test(query.date) ? query.date : today;
  const day = asked > today ? today : asked;
  // Staff see quantities only; money is for owners and admins.
  const showMoney = canManage(role);

  const [stock, returnables, orders, trips, receipts, waiting, loading, out] = await Promise.all([
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
    supabase.from("dispatch_trips").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("status", "dispatched")
  ]);

  const stockRows = stock.data ?? [];
  const returnableRows = returnables.data ?? [];
  const orderRows = orders.data ?? [];
  const tripRows = trips.data ?? [];
  const counted = orderRows.filter((order) => order.status !== "cancelled");
  const soldQuantity = counted.reduce((sum, order) => sum + Number(order.total_quantity), 0);
  const soldValue = counted.reduce((sum, order) => sum + Number(order.total_amount), 0);
  const failed = stock.error || returnables.error || orders.error || trips.error;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle sub={day === today ? "Today so far." : "What happened on this day."}>
          {formatDay(day)}
        </PageTitle>
        <div className="flex flex-wrap items-end gap-2">
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
            <Figure label="Orders recorded" value={String(counted.length)} strong />
            <Figure label="Items ordered" value={formatQuantity(soldQuantity)} />
            {showMoney ? (
              <Figure label="Order value" value={formatMoney(soldValue, org.currency_code)} />
            ) : (
              <Figure label="Trips sent out" value={String(tripRows.length)} />
            )}
            <Figure label="Deliveries received" value={String(receipts.count ?? 0)} />
          </div>

          <ListCard title="Stock">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem]">
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className={HEAD}>Product</th>
                    <th scope="col" className={`${HEAD} text-right`}>Opening</th>
                    <th scope="col" className={`${HEAD} text-right`}>Received</th>
                    <th scope="col" className={`${HEAD} text-right`}>Ordered out</th>
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
                      <td className={`${CELL} text-right text-lg font-extrabold`}>{formatQuantity(Number(row.closing))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {stockRows.length === 0 ? <p className="px-5 py-4 font-medium text-ink-soft">No products yet.</p> : null}
          </ListCard>

          {returnableRows.length > 0 ? (
            <ListCard title="Returnables">
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

          <ListCard title={`Orders recorded (${orderRows.length})`}>
            {orderRows.length === 0 ? (
              <p className="px-5 py-4 font-medium text-ink-soft">No orders were recorded on this day.</p>
            ) : (
              <ul className="divide-y divide-line">
                {orderRows.map((order) => (
                  <li key={order.id}>
                    <Link
                      href={`${base}/orders/${order.id}`}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 hover:bg-paper"
                    >
                      <span className="min-w-0">
                        <span className="block font-extrabold">{order.customer_name}</span>
                        <span className="text-sm font-medium text-ink-soft">
                          {order.order_no} · {formatQuantity(Number(order.total_quantity))} items
                          {showMoney ? ` · ${formatMoney(Number(order.total_amount), org.currency_code)}` : ""}
                        </span>
                      </span>
                      <OrderStatusBadge status={order.status} voided={Boolean(order.voided_at)} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </ListCard>

          <ListCard title={`Trips sent out (${tripRows.length})`}>
            {tripRows.length === 0 ? (
              <p className="px-5 py-4 font-medium text-ink-soft">No trips left on this day.</p>
            ) : (
              <ul className="divide-y divide-line">
                {tripRows.map((trip) => (
                  <li key={trip.id}>
                    <Link
                      href={`${base}/dispatch/${trip.id}`}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 hover:bg-paper"
                    >
                      <span className="font-extrabold">{trip.driver_name}</span>
                      <span className="text-sm font-medium text-ink-soft">
                        {trip.trip_no} · {trip.order_count} order{trip.order_count === 1 ? "" : "s"} ·{" "}
                        {formatQuantity(Number(trip.total_quantity))} items
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </ListCard>

          <ListCard title="Still open right now">
            <ul className="divide-y divide-line">
              {[
                ["Orders waiting for dispatch", waiting.count ?? 0, `${base}/orders`],
                ["Trips being loaded", loading.count ?? 0, `${base}/dispatch`],
                ["Trips out, returns not yet recorded", out.count ?? 0, `${base}/returns`]
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
