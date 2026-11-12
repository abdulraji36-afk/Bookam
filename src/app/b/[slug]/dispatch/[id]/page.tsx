import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cancelTripAction, dispatchTripAction } from "@/app/actions/orders";
import { OrderStatusBadge, TripStatusBadge } from "@/components/orders/status-badge";
import { ActionButton } from "@/components/team/action-button";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, ListCard, PageSkeleton, PageTitle } from "@/components/ui/card";
import { formatDay, formatQuantity } from "@/lib/format";
import { canManage, requireOrg } from "@/lib/org";

export const metadata: Metadata = { title: "Dispatch trip" };

async function Trip({ params }: Pick<PageProps<"/b/[slug]/dispatch/[id]">, "params">) {
  const { slug, id } = await params;
  const { supabase, org, role } = await requireOrg(slug);
  const base = `/b/${org.slug}`;

  const [tripResult, ordersResult] = await Promise.all([
    supabase
      .from("dispatch_trips")
      .select("id, trip_no, dispatch_date, driver_name, vehicle, status, note, locations (name), profiles (full_name)")
      .eq("organization_id", org.id)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("dispatch_trip_orders")
      .select(
        "orders (id, order_no, status, customers (name, area), order_items (quantity, products (id, name, unit), returnable_items (name)))"
      )
      .eq("trip_id", id)
  ]);
  const trip = tripResult.data;
  if (!trip) notFound();
  const orders = (ordersResult.data ?? []).flatMap((row) => (row.orders ? [row.orders] : []));

  // The loading list: how much of each product goes on the vehicle in total.
  const load = new Map<string, { name: string; unit: string; quantity: number }>();
  const returnsDue = new Map<string, number>();
  for (const order of orders) {
    for (const item of order.order_items) {
      if (!item.products) continue;
      const quantity = Number(item.quantity);
      const line = load.get(item.products.id) ?? { name: item.products.name, unit: item.products.unit, quantity: 0 };
      line.quantity += quantity;
      load.set(item.products.id, line);
      if (item.returnable_items) {
        returnsDue.set(item.returnable_items.name, (returnsDue.get(item.returnable_items.name) ?? 0) + quantity);
      }
    }
  }

  const details = [
    ["Driver", trip.driver_name],
    ["Vehicle", trip.vehicle],
    ["Dispatch date", formatDay(trip.dispatch_date)],
    ["Leaving from", trip.locations?.name],
    ["Created by", trip.profiles?.full_name],
    ["Note", trip.note]
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle sub="Dispatch trip">{trip.trip_no}</PageTitle>
        <TripStatusBadge status={trip.status} />
      </div>

      {trip.status === "dispatched" ? (
        <Alert tone="info">
          This trip is out with returns to collect. Recording what comes back is the next feature being
          built.
        </Alert>
      ) : null}

      <Card>
        <dl className="grid gap-4 sm:grid-cols-2">
          {details.map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm font-bold uppercase tracking-wide text-ink-soft">{label}</dt>
              <dd className="font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {load.size > 0 ? (
        <ListCard title="Loading list">
          <ul className="divide-y divide-line">
            {[...load.values()]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((line) => (
              <li key={line.name} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="text-lg font-extrabold">{line.name}</span>
                <span>
                  <span className="text-2xl font-extrabold tabular-nums">{formatQuantity(line.quantity)}</span>{" "}
                  <span className="font-medium text-ink-soft">{line.unit}</span>
                </span>
              </li>
            ))}
          </ul>
          {returnsDue.size > 0 ? (
            <p className="border-t-[3px] border-ink px-5 py-3 font-semibold">
              To bring back:{" "}
              {[...returnsDue.entries()].map(([name, quantity]) => `${formatQuantity(quantity)} ${name}`).join(", ")}
            </p>
          ) : null}
        </ListCard>
      ) : null}

      <ListCard title={orders.length === 1 ? "1 order" : `${orders.length} orders`}>
        {orders.length === 0 ? (
          <p className="px-5 py-4 font-medium text-ink-soft">
            The orders were sent back to the waiting list when this trip was cancelled.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {orders.map((order) => {
              const quantity = order.order_items.reduce((sum, item) => sum + Number(item.quantity), 0);
              const hasReturns = order.order_items.some((item) => item.returnable_items);
              return (
                <li key={order.id}>
                  <Link
                    href={`${base}/orders/${order.id}`}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4 hover:bg-paper"
                  >
                    <span className="min-w-0">
                      <span className="block text-lg font-extrabold">
                        {order.customers?.name}
                        {order.customers?.area ? ` (${order.customers.area})` : ""}
                      </span>
                      <span className="font-medium text-ink-soft">
                        {order.order_no} · {formatQuantity(quantity)} items
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      {hasReturns ? <Badge tone="solid">Return due</Badge> : <Badge>No return</Badge>}
                      {trip.status !== "draft" ? <OrderStatusBadge status={order.status} /> : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </ListCard>

      <div className="flex flex-wrap items-start gap-3">
        <Link href={`${base}/dispatch`} className={buttonClass("secondary")}>
          Back to dispatch
        </Link>
        {trip.status === "draft" ? (
          <>
            <ActionButton
              action={dispatchTripAction.bind(null, org.slug, trip.id)}
              label="Dispatch now"
              pendingLabel="Dispatching…"
              variant="primary"
              size="md"
              confirmMessage={`Send ${trip.trip_no} out now? Its orders can no longer be changed after this.`}
            />
            {canManage(role) ? (
              <ActionButton
                action={cancelTripAction.bind(null, org.slug, trip.id)}
                label="Cancel trip"
                pendingLabel="Cancelling…"
                variant="danger"
                size="md"
                confirmMessage={`Cancel ${trip.trip_no}? Its orders go back to waiting for dispatch.`}
              />
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function TripPage({ params }: PageProps<"/b/[slug]/dispatch/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Trip params={params} />
    </Suspense>
  );
}
