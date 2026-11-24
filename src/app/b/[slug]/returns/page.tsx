import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { Badge, EmptyState, PageSkeleton } from "@/components/ui/card";
import { DataTable, TableCard } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import {
  ADD_REASONS,
  describeOwed,
  formatDay,
  formatQuantity,
  MOVEMENT_LABELS,
  SUBTRACT_REASONS,
} from "@/lib/format";
import { canManage, requireOrg } from "@/lib/org";
import { getShortageLines } from "@/lib/shortages";

/** The tab title in the business's own words ("Return shortages" for goods). */
export async function generateMetadata({ params }: PageProps<"/b/[slug]/returns">): Promise<Metadata> {
  const { slug } = await params;
  const { t } = await requireOrg(slug);
  return { title: t("Empties") };
}

const signed = (value: number) =>
  value === 0 ? (
    <span className="text-ink-soft">—</span>
  ) : (
    `${value > 0 ? "+" : "−"}${formatQuantity(Math.abs(value))}`
  );

async function Returns({
  params,
  searchParams,
}: PageProps<"/b/[slug]/returns">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { supabase, org, role, t } = await requireOrg(slug);
  const base = `/b/${org.slug}`;
  const manager = canManage(role);
  const word = org.sells_drinks ? t("Empties") : "Returns";

  const [
    totalsResult,
    tripsResult,
    balancesResult,
    activityResult,
    shortageResult,
  ] = await Promise.all([
    supabase
      .from("returnable_totals")
      .select("returnable_item_id, name, holding, owed, credit")
      .eq("organization_id", org.id)
      .order("name"),
    supabase
      .from("dispatch_trip_summaries")
      .select("id, trip_no, dispatch_date, driver_name, vehicle, order_count")
      .eq("organization_id", org.id)
      .eq("status", "dispatched")
      .order("dispatch_date"),
    supabase
      .from("customer_returnable_balances")
      .select(
        "customer_id, customer_name, customer_area, returnable_item_id, returnable_name, owed",
      )
      .eq("organization_id", org.id)
      .order("owed", { ascending: false })
      .limit(200),
    supabase
      .from("returnable_movements")
      .select(
        "id, movement_date, movement_type, source_type, source_id, holding_delta, owed_delta, returnable_items (name), customers (name)",
      )
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .limit(30),
    org.sells_drinks
      ? getShortageLines(supabase, org.id, { openOnly: true })
      : Promise.resolve({ rows: [], error: null }),
  ]);
  const openShortages = shortageResult.rows;
  const totals = totalsResult.data ?? [];
  const trips = tripsResult.data ?? [];
  const balances = balancesResult.data ?? [];
  const activity = activityResult.data ?? [];
  const manyItems = totals.length > 1;

  // Say why each adjustment was made, and where an exchange came from.
  const adjustmentIds = activity
    .filter((move) => move.source_type === "returnable_adjustment")
    .map((move) => move.source_id);
  const exchangeIds = activity
    .filter((move) => move.source_type === "supplier_exchange")
    .map((move) => move.source_id);
  const followupIds = activity
    .filter((move) => move.source_type === "empties_followup")
    .map((move) => move.source_id);
  const [{ data: adjustments }, { data: exchanges }, { data: followups }] =
    await Promise.all([
      adjustmentIds.length
        ? supabase
            .from("returnable_adjustments")
            .select("id, reason, voided_at")
            .in("id", adjustmentIds)
        : Promise.resolve({ data: [] }),
      exchangeIds.length
        ? supabase
            .from("supplier_exchanges")
            .select("id, receipt_id, exchange_no")
            .in("id", exchangeIds)
        : Promise.resolve({ data: [] }),
      followupIds.length
        ? supabase
            .from("empties_followups")
            .select("id, trip_return_lines (order_id)")
            .in("id", followupIds)
        : Promise.resolve({ data: [] }),
    ]);
  const followupOrder = new Map(
    (followups ?? []).map((item) => [
      item.id,
      item.trip_return_lines?.order_id,
    ]),
  );
  const reasonLabels = new Map<string, string>([
    ...ADD_REASONS,
    ...SUBTRACT_REASONS,
  ]);
  if (org.sells_drinks)
    reasonLabels.set("opening_count", t("Opening empties (already in store)"));
  const reasonById = new Map(
    (adjustments ?? []).map((item) => [item.id, reasonLabels.get(item.reason)]),
  );
  const exchangeById = new Map(
    (exchanges ?? []).map((item) => [item.id, item]),
  );

  type Move = (typeof activity)[number];
  const moveHref = (move: Move) => {
    if (move.source_type === "dispatch_trip")
      return `${base}/dispatch/${move.source_id}`;
    if (
      move.source_type === "empties_followup" &&
      followupOrder.get(move.source_id)
    ) {
      return `${base}/orders/${followupOrder.get(move.source_id)}`;
    }
    if (move.source_type === "returnable_adjustment")
      return `${base}/returns/adjustments/${move.source_id}`;
    if (move.source_type === "supplier_exchange") {
      const exchange = exchangeById.get(move.source_id);
      return exchange?.receipt_id
        ? `${base}/stock/receipts/${exchange.receipt_id}`
        : `${base}/returns/exchanges/${move.source_id}`;
    }
    return `${base}/returns`;
  };

  if (totals.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={word} />
        <EmptyState title="Nothing to track yet">
          {org.sells_drinks
            ? t("Add an RGB drink first; its empties are counted here.")
            : "None of your products need anything brought back."}
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {typeof query.saved === "string" ? (
        <Alert tone="success">
          {query.saved === "adjustment"
            ? "Adjustment saved."
            : query.saved === "customer-return"
              ? "Saved against the order. The customer owes that many fewer, and they are in the store count."
              : `Supplier exchange ${query.saved} saved.`}
        </Alert>
      ) : null}

      <PageHeader
        title={word}
        sub="What is in store, what customers still have to bring back, and every movement."
        actions={
          <>
            {org.sells_drinks ? (
              manager ? (
                <Link
                  href={`${base}/returns/customer-return`}
                  className={buttonClass("primary")}
                >
                  {t("Customer brought back empties")}
                </Link>
              ) : null
            ) : (
              <Link
                href={`${base}/returns/exchange`}
                className={buttonClass("primary")}
              >
                {t("Supplier exchange")}
              </Link>
            )}
            {manager ? (
              <Link
                href={`${base}/returns/adjust`}
                className={buttonClass("secondary")}
              >
                Add or subtract
              </Link>
            ) : null}
            {org.sells_drinks ? (
              <Link
                href={`${base}/returns/exchange`}
                className={buttonClass("ghost")}
              >
                {t("Empty exchange")}
              </Link>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {totals.map((item) => (
          <section
            key={item.returnable_item_id}
            className="overflow-hidden rounded-md bg-white"
          >
            <h2 className="border-b-[3px] border-ink px-5 py-3 text-lg font-extrabold">
              {item.name}
            </h2>
            <dl className="grid grid-cols-2 divide-x divide-line">
              <div className="px-5 py-4">
                <dd className="text-4xl font-extrabold leading-none tabular-nums">
                  {formatQuantity(Number(item.holding))}
                </dd>
                <dt className="mt-2 text-sm font-bold uppercase tracking-wide text-ink-soft">
                  In store
                </dt>
              </div>
              <div className="px-5 py-4">
                <dd className="text-4xl font-extrabold leading-none tabular-nums">
                  {formatQuantity(Number(item.owed))}
                </dd>
                <dt className="mt-2 text-sm font-bold uppercase tracking-wide text-ink-soft">
                  Owed by customers
                </dt>
              </div>
            </dl>
            {Number(item.credit) > 0 ? (
              <p className="border-t border-line px-5 py-2.5 text-sm font-semibold text-ink-soft">
                {formatQuantity(Number(item.credit))} of those in store are held
                for customers in credit.
              </p>
            ) : null}
          </section>
        ))}
      </div>

      {trips.length > 0 ? (
        <TableCard title="Trips to record returns for">
          <DataTable
            label="Trips to record returns for"
            rows={trips}
            rowKey={(trip) => trip.id}
            rowHref={(trip) => `${base}/dispatch/${trip.id}`}
            columns={[
              {
                header: "Trip no.",
                cell: (trip) => (
                  <span className="tabular-nums">{trip.trip_no}</span>
                ),
              },
              {
                header: "Action",
                phone: "badge",
                cell: () => <Badge tone="accent">Record returns</Badge>,
              },
              { header: "Left", cell: (trip) => formatDay(trip.dispatch_date) },
              { header: "Driver", cell: (trip) => trip.driver_name },
              {
                header: "Orders",
                align: "right",
                cell: (trip) => trip.order_count,
              },
            ]}
          />
        </TableCard>
      ) : null}

      {org.sells_drinks ? (
        <TableCard
          title={t("Empty shortages")}
          action={
            <Link
              href={`${base}/returns/shortages`}
              className="text-sm font-bold underline underline-offset-4"
            >
              See all, with completed
            </Link>
          }
        >
          <DataTable
            label={t("Open empty shortages")}
            rows={openShortages.slice(0, 10)}
            rowKey={(line) => line.id}
            rowHref={(line) => `${base}/orders/${line.order_id}`}
            empty={t("No order is waiting for empties.")}
            columns={[
              {
                header: "Customer",
                wrap: true,
                cell: (line) => (
                  <span className="font-extrabold">{line.customer_name}</span>
                ),
              },
              {
                header: "Outstanding",
                align: "right",
                phone: "badge",
                cell: (line) => (
                  <Badge tone="solid">
                    {formatQuantity(Number(line.outstanding))} owed
                  </Badge>
                ),
              },
              {
                header: "Order",
                cell: (line) => (
                  <span className="tabular-nums">{line.order_no}</span>
                ),
              },
              {
                header: "Back",
                cell: (line) =>
                  line.returned_date ? formatDay(line.returned_date) : "—",
              },
              {
                header: "Expected",
                align: "right",
                cell: (line) => formatQuantity(Number(line.expected)),
              },
              {
                header: "Returned",
                align: "right",
                cell: (line) => formatQuantity(Number(line.total_returned)),
              },
            ]}
          />
        </TableCard>
      ) : (
        <TableCard title="Customer balances">
          <DataTable
            label="Customer balances"
            rows={balances}
            rowKey={(balance) =>
              `${balance.customer_id}-${balance.returnable_item_id}`
            }
            rowHref={
              manager
                ? (balance) => `${base}/customers/${balance.customer_id}`
                : undefined
            }
            empty="No customer owes anything right now."
            columns={[
              {
                header: "Customer",
                wrap: true,
                cell: (balance) => balance.customer_name,
              },
              {
                header: "Owes",
                align: "right",
                phone: "badge",
                cell: (balance) => (
                  <Badge tone={Number(balance.owed) > 0 ? "solid" : "plain"}>
                    {describeOwed(Number(balance.owed))}
                  </Badge>
                ),
              },
              {
                header: "Area",
                cell: (balance) =>
                  balance.customer_area ?? (
                    <span className="text-ink-soft">—</span>
                  ),
              },
              ...(manyItems
                ? [
                    {
                      header: "Item",
                      cell: (balance: (typeof balances)[number]) =>
                        balance.returnable_name,
                    },
                  ]
                : []),
            ]}
          />
        </TableCard>
      )}

      {activity.length > 0 ? (
        <TableCard title="Latest movements">
          <DataTable
            label="Latest movements"
            rows={activity}
            rowKey={(move) => move.id}
            rowHref={moveHref}
            columns={[
              {
                header: "What happened",
                wrap: true,
                cell: (move) => (
                  <>
                    {move.source_type === "empties_followup"
                      ? "Brought back later (follow-up)"
                      : move.source_type === "drinks_no_credit"
                        ? t("Extra empties are not credit")
                        : MOVEMENT_LABELS[move.movement_type]}
                    {reasonById.get(move.source_id)
                      ? `: ${reasonById.get(move.source_id)}`
                      : ""}
                  </>
                ),
              },
              { header: "Date", cell: (move) => formatDay(move.movement_date) },
              ...(manyItems
                ? [
                    {
                      header: "Item",
                      cell: (move: Move) => move.returnable_items?.name ?? "",
                    },
                  ]
                : []),
              {
                header: "Customer",
                wrap: true,
                cell: (move) =>
                  move.customers?.name ?? (
                    <span className="text-ink-soft">—</span>
                  ),
              },
              {
                header: "In store",
                align: "right",
                cell: (move) => signed(Number(move.holding_delta)),
              },
              {
                header: "Owed",
                align: "right",
                cell: (move) => signed(Number(move.owed_delta)),
              },
            ]}
          />
        </TableCard>
      ) : null}
    </div>
  );
}

export default function ReturnsPage(props: PageProps<"/b/[slug]/returns">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Returns {...props} />
    </Suspense>
  );
}
