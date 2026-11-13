import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { voidAdjustmentAction, voidSupplierExchangeAction } from "@/app/actions/corrections";
import { ReasonForm } from "@/components/corrections/reason-form";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { Badge, EmptyState, ListCard, PageSkeleton, PageTitle } from "@/components/ui/card";
import {
  ADD_REASONS,
  describeOwed,
  formatDay,
  formatQuantity,
  MOVEMENT_LABELS,
  SUBTRACT_REASONS
} from "@/lib/format";
import { canManage, requireOrg } from "@/lib/org";

export const metadata: Metadata = { title: "Returns" };

const signed = (value: number) => `${value > 0 ? "+" : "−"}${formatQuantity(Math.abs(value))}`;

async function Returns({ params, searchParams }: PageProps<"/b/[slug]/returns">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { supabase, org, role } = await requireOrg(slug);
  const base = `/b/${org.slug}`;
  const manager = canManage(role);

  const [totalsResult, tripsResult, balancesResult, activityResult] = await Promise.all([
    supabase.from("returnable_totals").select("returnable_item_id, name, holding, owed, credit").eq("organization_id", org.id).order("name"),
    supabase
      .from("dispatch_trip_summaries")
      .select("id, trip_no, dispatch_date, driver_name, order_count")
      .eq("organization_id", org.id)
      .eq("status", "dispatched")
      .order("dispatch_date"),
    supabase
      .from("customer_returnable_balances")
      .select("customer_id, customer_name, customer_area, returnable_item_id, returnable_name, owed")
      .eq("organization_id", org.id)
      .order("owed", { ascending: false })
      .limit(200),
    supabase
      .from("returnable_movements")
      .select(
        "id, movement_date, movement_type, source_type, source_id, holding_delta, owed_delta, returnable_items (name), customers (name)"
      )
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .limit(20)
  ]);
  const totals = totalsResult.data ?? [];
  const trips = tripsResult.data ?? [];
  const balances = balancesResult.data ?? [];
  const activity = activityResult.data ?? [];

  // Say why each adjustment was made, not just that there was one.
  const adjustmentIds = activity
    .filter((movement) => movement.movement_type === "adjustment")
    .map((movement) => movement.source_id);
  const { data: adjustments } = adjustmentIds.length
    ? await supabase.from("returnable_adjustments").select("id, reason").in("id", adjustmentIds)
    : { data: [] };
  const reasonLabels = new Map([...ADD_REASONS, ...SUBTRACT_REASONS]);
  const reasonById = new Map((adjustments ?? []).map((item) => [item.id, reasonLabels.get(item.reason)]));

  if (totals.length === 0) {
    return (
      <div className="space-y-6">
        <PageTitle>Returns</PageTitle>
        <EmptyState title="Nothing to track yet">
          None of your products need anything brought back. To start, edit a product and tick
          &ldquo;Customers must bring something back&rdquo;.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {typeof query.saved === "string" ? (
        <Alert tone="success">
          {query.saved === "adjustment" ? "Adjustment saved." : `Supplier exchange ${query.saved} saved.`}
        </Alert>
      ) : null}

      <div className="page-head">
        <PageTitle sub="What is in store, and what customers still have to bring back.">Returns</PageTitle>
        <div className="flex flex-wrap gap-2">
          <Link href={`${base}/returns/exchange`} className={buttonClass("primary")}>
            Supplier exchange
          </Link>
          {manager ? (
            <Link href={`${base}/returns/adjust`} className={buttonClass("secondary")}>
              Add or subtract
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {totals.map((item) => (
          <section key={item.returnable_item_id} className="overflow-hidden rounded-md bg-white">
            <h2 className="border-b-[3px] border-ink px-5 py-3 text-lg font-extrabold">
              {item.name}
            </h2>
            <dl className="grid grid-cols-2 divide-x divide-line">
              <div className="px-5 py-4">
                <dd className="text-4xl font-extrabold leading-none tabular-nums">
                  {formatQuantity(Number(item.holding))}
                </dd>
                <dt className="mt-2 text-sm font-bold uppercase tracking-wide text-ink-soft">In store</dt>
              </div>
              <div className="px-5 py-4">
                <dd className="text-4xl font-extrabold leading-none tabular-nums">
                  {formatQuantity(Number(item.owed))}
                </dd>
                <dt className="mt-2 text-sm font-bold uppercase tracking-wide text-ink-soft">Owed by customers</dt>
              </div>
            </dl>
            {Number(item.credit) > 0 ? (
              <p className="border-t border-line px-5 py-2.5 text-sm font-semibold text-ink-soft">
                {formatQuantity(Number(item.credit))} of those in store are held for customers in credit.
              </p>
            ) : null}
          </section>
        ))}
      </div>

      {trips.length > 0 ? (
        <ListCard title="Trips to record returns for">
          <ul className="divide-y divide-line">
            {trips.map((trip) => (
              <li key={trip.id}>
                <Link
                  href={`${base}/dispatch/${trip.id}`}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4 hover:bg-paper"
                >
                  <span>
                    <span className="block text-lg font-extrabold">{trip.driver_name}</span>
                    <span className="font-medium text-ink-soft">
                      {trip.trip_no} · left {formatDay(trip.dispatch_date)} · {trip.order_count} order
                      {trip.order_count === 1 ? "" : "s"}
                    </span>
                  </span>
                  <Badge tone="accent">Record returns</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </ListCard>
      ) : null}

      <ListCard title="Customer balances">
        {balances.length === 0 ? (
          <p className="px-5 py-4 font-medium text-ink-soft">No customer owes anything right now.</p>
        ) : (
          <ul className="divide-y divide-line">
            {balances.map((balance) => (
              <li
                key={`${balance.customer_id}-${balance.returnable_item_id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <span className="min-w-0">
                  <span className="block font-extrabold">
                    {balance.customer_name}
                    {balance.customer_area ? ` (${balance.customer_area})` : ""}
                  </span>
                  <span className="text-sm font-medium text-ink-soft">{balance.returnable_name}</span>
                </span>
                <Badge tone={Number(balance.owed) > 0 ? "solid" : "plain"}>{describeOwed(Number(balance.owed))}</Badge>
              </li>
            ))}
          </ul>
        )}
      </ListCard>

      {activity.length > 0 ? (
        <ListCard title="Latest activity">
          <ul className="divide-y divide-line">
            {activity.map((movement) => (
              <li key={movement.id} className="space-y-2 px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <span className="min-w-0">
                  <span className="block font-extrabold">
                    {MOVEMENT_LABELS[movement.movement_type]}
                    {reasonById.get(movement.source_id) ? `: ${reasonById.get(movement.source_id)}` : ""}
                  </span>
                  <span className="text-sm font-medium text-ink-soft">
                    {[formatDay(movement.movement_date), movement.returnable_items?.name, movement.customers?.name]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="text-right text-sm font-bold tabular-nums">
                  {Number(movement.holding_delta) !== 0 ? (
                    <span className="block">In store {signed(Number(movement.holding_delta))}</span>
                  ) : null}
                  {Number(movement.owed_delta) !== 0 ? (
                    <span className="block text-ink-soft">Owed {signed(Number(movement.owed_delta))}</span>
                  ) : null}
                </span>
                </div>
                {manager && movement.source_type === "supplier_exchange" ? (
                  <ReasonForm
                    compact
                    action={voidSupplierExchangeAction.bind(null, org.slug, movement.source_id)}
                    trigger="Void this exchange"
                    explanation="Use this when the exchange was recorded by mistake. The quantity goes back into the store count."
                    submitLabel="Void exchange"
                  />
                ) : null}
                {manager && movement.source_type === "returnable_adjustment" ? (
                  <ReasonForm
                    compact
                    action={voidAdjustmentAction.bind(null, org.slug, movement.source_id)}
                    trigger="Void this adjustment"
                    explanation="Use this when the adjustment was recorded by mistake. Its effect on the store count, and on the customer's balance if one was named, is reversed."
                    submitLabel="Void adjustment"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </ListCard>
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
