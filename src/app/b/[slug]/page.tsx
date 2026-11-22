import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { WeekChart, type DayCount } from "@/components/dashboard/week-chart";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, CardHeader, PageSkeleton, PageTitle } from "@/components/ui/card";
import { DataTable, TableCard } from "@/components/ui/data-table";
import { describeOwed, formatDay, formatQuantity, ROLE_LABELS, todayIn } from "@/lib/format";
import { canManage, requireOrg } from "@/lib/org";
import { requestNow } from "@/lib/request-time";
import { saleWords } from "@/lib/selling";
import { getStockRows } from "@/lib/stock";
import { DrinksCards, DrinksDesk } from "./drinks-desk";

export const metadata: Metadata = { title: "Dashboard" };

const SEE_ALL = "text-sm font-extrabold underline decoration-accent decoration-2 underline-offset-4";

/** The seven days ending today, oldest first, as YYYY-MM-DD. */
function lastSevenDays(today: string) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - (6 - index));
    return date.toISOString().slice(0, 10);
  });
}

async function Dashboard({ params }: Pick<PageProps<"/b/[slug]">, "params">) {
  const { slug } = await params;
  const { supabase, org, role, user, t } = await requireOrg(slug);
  const base = `/b/${org.slug}`;
  const today = todayIn(org.timezone, await requestNow());
  const week = lastSevenDays(today);

  const count = (table: "memberships" | "products" | "customers") =>
    supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("is_active", true);
  const tripCount = (statuses: ("draft" | "dispatched" | "completed")[]) =>
    supabase
      .from("dispatch_trips")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .in("status", statuses);

  const [
    members,
    products,
    customers,
    received,
    stockRows,
    profile,
    waiting,
    loading,
    trips,
    returnables,
    returned,
    waitingOrders,
    tripsOut,
    balances,
    weekOrders,
    orderCount
  ] = await Promise.all([
    count("memberships"),
    count("products"),
    count("customers"),
    supabase.from("stock_receipts").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
    getStockRows(supabase, org.id, null),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("status", "pending"),
    tripCount(["draft"]),
    tripCount(["dispatched", "completed"]),
    supabase.from("returnable_totals").select("owed").eq("organization_id", org.id),
    supabase.from("trip_return_lines").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
    supabase
      .from("order_summaries")
      .select(
        "id, order_no, order_date, status, customer_name, customer_area, total_quantity, total_amount, has_returns, voided_at"
      )
      .eq("organization_id", org.id)
      .eq("status", "pending")
      .order("created_at")
      .limit(5),
    supabase
      .from("dispatch_trip_summaries")
      .select("id, trip_no, dispatch_date, driver_name, order_count")
      .eq("organization_id", org.id)
      .eq("status", "dispatched")
      .order("dispatch_date")
      .limit(5),
    supabase
      .from("customer_returnable_balances")
      .select("customer_id, customer_name, returnable_item_id, returnable_name, owed")
      .eq("organization_id", org.id)
      .gt("owed", 0)
      .order("owed", { ascending: false })
      .limit(5),
    supabase
      .from("orders")
      .select("order_date")
      .eq("organization_id", org.id)
      .neq("status", "cancelled")
      .gte("order_date", week[0])
      .lte("order_date", today)
      .limit(5000),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("organization_id", org.id)
  ]);
  const words = saleWords(org.selling_mode);
  const delivers = org.does_delivery;
  const waitingTitle = delivers ? "Waiting for dispatch" : "Waiting to be collected";

  const firstName = profile.data?.full_name?.split(" ")[0];
  const teamCount = members.count ?? 0;
  const productCount = products.count ?? 0;
  const lowRows = stockRows.filter((row) => row.isLow);
  const manager = canManage(role);
  const tracksReturns = (returnables.data ?? []).length > 0 && (!org.sells_drinks || org.tracks_returns);
  const owedBack = (returnables.data ?? []).reduce((sum, item) => sum + Number(item.owed), 0);
  // A drinks depot counts the empties it already has before it starts.
  const { count: openingEmpties } = org.sells_drinks
    ? await supabase
        .from("returnable_adjustments")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", org.id)
        .eq("reason", "opening_count")
        .is("voided_at", null)
    : { count: 0 };

  const perDay = new Map<string, number>();
  for (const order of weekOrders.data ?? []) perDay.set(order.order_date, (perDay.get(order.order_date) ?? 0) + 1);
  const days: DayCount[] = week.map((day) => ({
    day,
    weekday: new Intl.DateTimeFormat("en-NG", {
      weekday: "short",
      timeZone: "UTC"
    }).format(new Date(`${day}T00:00:00Z`)),
    dateLabel: new Intl.DateTimeFormat("en-NG", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC"
    }).format(new Date(`${day}T00:00:00Z`)),
    count: perDay.get(day) ?? 0,
    isToday: day === today
  }));
  const weekTotal = days.reduce((sum, day) => sum + day.count, 0);

  const steps = [
    { label: "Create your business", done: true },
    {
      label: "Invite your team",
      done: teamCount > 1,
      href: manager ? `${base}/team` : undefined
    },
    {
      label: "Add the products you sell",
      done: productCount > 0,
      href: manager ? `${base}/products/new` : undefined
    },
    ...(org.sells_drinks && org.tracks_returns
      ? [
          {
            label: t("Count your opening empties"),
            done: (openingEmpties ?? 0) > 0,
            href: manager ? `${base}/returns/adjust?reason=opening_count` : undefined
          }
        ]
      : []),
    {
      label: "Record the stock you have",
      done: (received.count ?? 0) > 0,
      href: productCount > 0 ? `${base}/stock/receive` : undefined
    },
    delivers
      ? {
          label: `Record ${words.one === "sale" ? "a sale" : "an order"} and dispatch it`,
          done: (trips.count ?? 0) > 0,
          href: (received.count ?? 0) > 0 ? `${base}/orders/new` : undefined
        }
      : {
          label: `Record your first ${words.one}`,
          done: (orderCount.count ?? 0) > 0,
          href: (received.count ?? 0) > 0 ? `${base}/orders/new` : undefined
        },
    ...(tracksReturns
      ? [
          {
            label: "Record what customers bring back",
            done: (returned.count ?? 0) > 0,
            href: (trips.count ?? 0) > 0 || !delivers ? `${base}/returns` : undefined
          }
        ]
      : [])
  ];
  // The checklist is for getting started; once it is all done it goes away.
  const settingUp = steps.some((step) => !step.done);

  return (
    <div className="space-y-6">
      <div className="page-head">
        <PageTitle sub={`${formatDay(today)} · ${org.name} · ${ROLE_LABELS[role]}`}>
          {firstName ? `Welcome, ${firstName}` : "Welcome"}
        </PageTitle>
        <div className="flex flex-wrap gap-2">
          <Link href={`${base}/orders/new`} className={buttonClass("primary")}>
            + New {words.one}
          </Link>
          <Link href={`${base}/stock/receive`} className={buttonClass("secondary")}>
            Receive stock
          </Link>
        </div>
      </div>

      {org.selling_mode === "serial" ? (
        <form method="get" action={`${base}/stock/serials`} className="flex flex-wrap items-end gap-2" role="search">
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

      {org.sells_drinks ? (
        <DrinksCards supabase={supabase} organizationId={org.id} today={today} manager={manager} t={t} />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label={waitingTitle} value={waiting.count ?? 0} strong href={`${base}/orders`} />
        {delivers ? (
          <StatTile label="Trips loading" value={loading.count ?? 0} href={`${base}/dispatch`} />
        ) : (
          <StatTile label={`${words.Many} today`} value={perDay.get(today) ?? 0} href={`${base}/orders`} />
        )}
        <StatTile label="Low stock" value={lowRows.length} href={`${base}/stock/summary?show=low`} />
        {tracksReturns ? (
          <StatTile label="Owed back by customers" value={owedBack} href={`${base}/returns`} />
        ) : (
          <StatTile label="Customers" value={customers.count ?? 0} href={`${base}/customers`} />
        )}
        </div>
      )}

      {settingUp ? (
        <Card>
          <CardHeader title="Getting set up" />
          <ol className="space-y-3">
            {steps.map((step) => (
              <li key={step.label} className="flex items-center justify-between gap-3">
                <span className={step.done ? "text-ink-soft line-through" : "font-semibold text-ink"}>
                  {step.href && !step.done ? (
                    <Link
                      href={step.href}
                      className="font-extrabold text-ink underline decoration-accent decoration-4 underline-offset-4"
                    >
                      {step.label}
                    </Link>
                  ) : (
                    step.label
                  )}
                </span>
                {step.done ? <Badge tone="success">Done</Badge> : null}
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      {org.sells_drinks ? <DrinksDesk base={base} manager={manager} t={t} /> : null}

      <Card>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-lg font-extrabold">{words.Many} this week</h2>
          <p className="font-medium text-ink-soft">
            <span className="text-2xl font-extrabold tabular-nums text-ink">{formatQuantity(weekTotal)}</span> in the
            last 7 days
          </p>
        </div>
        <WeekChart days={days} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <TableCard
          title={waitingTitle}
          action={
            <Link href={`${base}/orders?status=waiting`} className={SEE_ALL}>
              See all
            </Link>
          }
        >
          <DataTable
            label={waitingTitle}
            rows={waitingOrders.data ?? []}
            rowKey={(order) => order.id}
            rowHref={(order) => `${base}/orders/${order.id}`}
            empty={delivers ? `Nothing is waiting. Every ${words.one} has gone out.` : "Nothing is waiting to be collected."}
            columns={[
              { header: "Customer", wrap: true, cell: (order) => order.customer_name },
              { header: `${words.One} no.`, cell: (order) => <span className="tabular-nums">{order.order_no}</span> },
              { header: "Items", align: "right", phone: "badge", cell: (order) => formatQuantity(Number(order.total_quantity)) }
            ]}
          />
        </TableCard>

        <TableCard
          title="Running low"
          action={
            <Link href={`${base}/stock/summary?show=low`} className={SEE_ALL}>
              See stock
            </Link>
          }
        >
          <DataTable
            label="Running low"
            rows={lowRows.slice(0, 5)}
            rowKey={(row) => row.productId}
            empty="Nothing is running low."
            columns={[
              { header: "Product", wrap: true, cell: (row) => <span className="font-extrabold">{row.name}</span> },
              {
                header: "Left",
                align: "right",
                phone: "badge",
                cell: (row) => (
                  <span className="text-lg font-extrabold">
                    {formatQuantity(row.onHand)} <span className="text-sm font-medium text-ink-soft">{row.unit}</span>
                  </span>
                )
              }
            ]}
          />
        </TableCard>

        {tracksReturns ? (
          <>
            {delivers ? (
              <TableCard
                title="Out now, returns due"
                action={
                  <Link href={`${base}/dispatch?status=out`} className={SEE_ALL}>
                    See trips
                  </Link>
                }
              >
                <DataTable
                  label="Out now, returns due"
                  rows={tripsOut.data ?? []}
                  rowKey={(trip) => trip.id}
                  rowHref={(trip) => `${base}/dispatch/${trip.id}`}
                  empty="No trip is waiting for its returns."
                  columns={[
                    { header: "Driver", cell: (trip) => trip.driver_name },
                    { header: "Action", phone: "badge", cell: () => <Badge tone="accent">Record returns</Badge> },
                    { header: "Trip no.", cell: (trip) => <span className="tabular-nums">{trip.trip_no}</span> },
                    { header: "Left", cell: (trip) => formatDay(trip.dispatch_date) }
                  ]}
                />
              </TableCard>
            ) : null}

            <TableCard
              title={org.sells_drinks ? t("Empty shortages") : "Owes the most"}
              action={
                <Link href={`${base}/returns`} className={SEE_ALL}>
                  See all
                </Link>
              }
            >
              <DataTable
                label={org.sells_drinks ? t("Empty shortages") : "Owes the most"}
                rows={balances.data ?? []}
                rowKey={(balance) => `${balance.customer_id}-${balance.returnable_item_id}`}
                empty="No customer owes anything right now."
                columns={[
                  { header: "Customer", wrap: true, cell: (balance) => <span className="font-extrabold">{balance.customer_name}</span> },
                  {
                    header: "Owes",
                    align: "right",
                    phone: "badge",
                    cell: (balance) => <Badge tone="solid">{describeOwed(Number(balance.owed))}</Badge>
                  },
                  { header: "Item", cell: (balance) => balance.returnable_name }
                ]}
              />
            </TableCard>
          </>
        ) : null}
      </div>
    </div>
  );
}

function StatTile({ label, value, strong, href }: { label: string; value: number; strong?: boolean; href: string }) {
  return (
    <Link
      href={href}
      className={`block rounded-md border-2 border-transparent px-5 py-4 transition-transform duration-150 hover:-translate-y-0.5 hover:border-accent active:translate-y-0 active:scale-[0.98] ${
        strong ? "bg-ink text-white" : "bg-white"
      }`}
    >
      <p className="text-5xl font-extrabold leading-none tabular-nums">{formatQuantity(value)}</p>
      <p className={`mt-2 text-sm font-bold uppercase tracking-wide ${strong ? "text-nav" : "text-ink-soft"}`}>
        {label}
      </p>
    </Link>
  );
}

export default function DashboardPage({ params }: PageProps<"/b/[slug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dashboard params={params} />
    </Suspense>
  );
}
