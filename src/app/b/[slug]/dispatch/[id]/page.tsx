import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { correctTripReturnAction } from "@/app/actions/corrections";
import { cancelTripAction, dispatchTripAction } from "@/app/actions/orders";
import { recordTripReturnsAction } from "@/app/actions/returns";
import { OrderStatusBadge, TripStatusBadge } from "@/components/orders/status-badge";
import { ReasonForm } from "@/components/corrections/reason-form";
import { TripReturnsForm, type ReturnLine } from "@/components/returns/trip-returns-form";
import { ActionButton } from "@/components/team/action-button";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, CardHeader, ListCard, PageSkeleton, PageTitle } from "@/components/ui/card";
import { formatDay, formatQuantity, todayIn } from "@/lib/format";
import { canManage, requireOrg } from "@/lib/org";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Dispatch trip" };

async function Trip({ params }: Pick<PageProps<"/b/[slug]/dispatch/[id]">, "params">) {
  const { slug, id } = await params;
  const { supabase, org, role } = await requireOrg(slug);
  const base = `/b/${org.slug}`;

  const [tripResult, ordersResult, returnLinesResult] = await Promise.all([
    supabase
      .from("dispatch_trips")
      .select(
        "id, trip_no, dispatch_date, returned_date, driver_name, vehicle, status, note, locations (name), profiles (full_name)"
      )
      .eq("organization_id", org.id)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("dispatch_trip_orders")
      .select(
        "orders (id, order_no, status, customers (name, area), order_items (quantity, products (id, name, unit), returnable_items (id, name)))"
      )
      .eq("trip_id", id),
    supabase
      .from("trip_return_lines")
      .select("id, order_id, expected_quantity, returned_quantity, corrected_at, returnable_items (name)")
      .eq("trip_id", id)
  ]);
  const trip = tripResult.data;
  if (!trip) notFound();
  const orders = (ordersResult.data ?? []).flatMap((row) => (row.orders ? [row.orders] : []));
  // An order still on a trip but cancelled was voided after the trip was built.
  const liveOrders = orders.filter((order) => order.status !== "cancelled");
  const manager = canManage(role);

  // The loading list: how much of each product goes on the vehicle in total.
  const load = new Map<string, { name: string; unit: string; quantity: number }>();
  const returnsDue = new Map<string, number>();
  for (const order of liveOrders) {
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

  // One line per customer and returnable item: what the trip should bring back.
  const expectedReturns: ReturnLine[] = [];
  for (const order of liveOrders) {
    const byItem = new Map<string, ReturnLine>();
    for (const item of order.order_items) {
      if (!item.returnable_items) continue;
      const line = byItem.get(item.returnable_items.id) ?? {
        orderId: order.id,
        returnableItemId: item.returnable_items.id,
        customerName: order.customers?.name ?? "Customer",
        returnableName: item.returnable_items.name,
        expected: 0
      };
      line.expected += Number(item.quantity);
      byItem.set(item.returnable_items.id, line);
    }
    expectedReturns.push(...byItem.values());
  }
  const customerByOrder = new Map(orders.map((order) => [order.id, order.customers?.name ?? "Customer"]));
  const returnLines = returnLinesResult.data ?? [];

  const details = [
    ["Driver", trip.driver_name],
    ["Vehicle", trip.vehicle],
    ["Dispatch date", formatDay(trip.dispatch_date)],
    ["Came back", trip.returned_date ? formatDay(trip.returned_date) : null],
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

      <ListCard title={liveOrders.length === 1 ? "1 order" : `${liveOrders.length} orders`}>
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
                      {trip.status !== "draft" ? (
                        <OrderStatusBadge status={order.status} voided={order.status === "cancelled"} />
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </ListCard>

      {trip.status === "dispatched" && expectedReturns.length > 0 ? (
        <Card>
          <CardHeader
            title="Record what came back"
            description="Each box starts at the full amount. Change only the ones that came back short or over."
          />
          <TripReturnsForm
            action={recordTripReturnsAction.bind(null, org.slug, trip.id)}
            lines={expectedReturns}
            today={todayIn(org.timezone, await requestNow())}
            dispatchDate={trip.dispatch_date}
          />
        </Card>
      ) : null}

      {returnLines.length > 0 ? (
        <ListCard title="What came back">
          <ul className="divide-y divide-line">
            {returnLines.map((line) => {
              const short = Number(line.expected_quantity) - Number(line.returned_quantity);
              return (
                <li key={line.id} className="space-y-2 px-5 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block font-extrabold">{customerByOrder.get(line.order_id)}</span>
                      <span className="text-sm font-medium text-ink-soft">
                        Returned {formatQuantity(Number(line.returned_quantity))} of{" "}
                        {formatQuantity(Number(line.expected_quantity))} {line.returnable_items?.name}
                        {line.corrected_at ? " · corrected" : ""}
                      </span>
                    </span>
                    {short > 0 ? (
                      <Badge tone="accent">Short by {formatQuantity(short)}</Badge>
                    ) : short < 0 ? (
                      <Badge tone="solid">{formatQuantity(-short)} extra</Badge>
                    ) : (
                      <Badge>All back</Badge>
                    )}
                  </div>
                  {manager ? (
                    <ReasonForm
                      compact
                      action={correctTripReturnAction.bind(null, org.slug, line.id)}
                      trigger="Correct this figure"
                      explanation="Enter the number that actually came back. The difference moves between the store count and this customer's balance."
                      submitLabel="Save correction"
                      quantity={{
                        label: `Returned by ${customerByOrder.get(line.order_id)}`,
                        current: Number(line.returned_quantity)
                      }}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </ListCard>
      ) : null}

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
            {manager ? (
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
