import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { correctTripReturnAction } from "@/app/actions/corrections";
import { cancelTripAction, dispatchTripAction } from "@/app/actions/orders";
import { recordTripReturnsAction } from "@/app/actions/returns";
import {
  OrderStatusBadge,
  TripStatusBadge,
} from "@/components/orders/status-badge";
import { ReasonForm } from "@/components/corrections/reason-form";
import {
  TripReturnsForm,
  type ReturnLine,
} from "@/components/returns/trip-returns-form";
import { ActionButton } from "@/components/team/action-button";
import { buttonClass } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardHeader,
  PageSkeleton,
  PageTitle,
} from "@/components/ui/card";
import { DataTable, TableCard } from "@/components/ui/data-table";
import { ActionsPanel } from "@/components/ui/page-header";
import { formatDay, formatQuantity, todayIn, unitWord } from "@/lib/format";
import { canManage, requireOrg } from "@/lib/org";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Dispatch trip" };

async function Trip({
  params,
}: Pick<PageProps<"/b/[slug]/dispatch/[id]">, "params">) {
  const { slug, id } = await params;
  const { supabase, org, role, t } = await requireOrg(slug);
  const base = `/b/${org.slug}`;

  const [tripResult, ordersResult, returnLinesResult] = await Promise.all([
    supabase
      .from("dispatch_trips")
      .select(
        "id, trip_no, dispatch_date, returned_date, driver_name, vehicle, status, note, locations (name), profiles (full_name), dispatch_trip_loaders (dispatch_workers (name))",
      )
      .eq("organization_id", org.id)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("dispatch_trip_orders")
      .select(
        "orders (id, order_no, status, buyer_name, customers (name, area), order_items (quantity, products (id, name, unit), returnable_items (id, name)))",
      )
      .eq("trip_id", id),
    supabase
      .from("trip_return_lines")
      .select(
        "id, order_id, expected_quantity, returned_quantity, corrected_at, returnable_items (name), empties_followups (quantity, voided_at)",
      )
      .eq("trip_id", id),
  ]);
  const trip = tripResult.data;
  if (!trip) notFound();
  const orders = (ordersResult.data ?? []).flatMap((row) =>
    row.orders ? [row.orders] : [],
  );
  // An order still on a trip but cancelled was voided after the trip was built.
  const liveOrders = orders.filter((order) => order.status !== "cancelled");
  const manager = canManage(role);

  // The loading list: how much of each product goes on the vehicle in total.
  const load = new Map<
    string,
    { name: string; unit: string; quantity: number; rgb: boolean }
  >();
  const returnsDue = new Map<string, number>();
  for (const order of liveOrders) {
    for (const item of order.order_items) {
      if (!item.products) continue;
      const quantity = Number(item.quantity);
      const line = load.get(item.products.id) ?? {
        name: item.products.name,
        unit: item.products.unit,
        quantity: 0,
        rgb: Boolean(item.returnable_items),
      };
      line.quantity += quantity;
      load.set(item.products.id, line);
      if (item.returnable_items) {
        returnsDue.set(
          item.returnable_items.name,
          (returnsDue.get(item.returnable_items.name) ?? 0) + quantity,
        );
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
        customerName:
          order.customers?.name ?? order.buyer_name ?? "Walk-in buyer",
        returnableName: item.returnable_items.name,
        expected: 0,
      };
      line.expected += Number(item.quantity);
      byItem.set(item.returnable_items.id, line);
    }
    expectedReturns.push(...byItem.values());
  }
  const customerByOrder = new Map(
    orders.map((order) => [
      order.id,
      order.customers?.name ?? order.buyer_name ?? "Walk-in buyer",
    ]),
  );
  const returnLines = returnLinesResult.data ?? [];

  const details = [
    ["Driver", trip.driver_name],
    [org.sells_drinks ? "Truck" : "Vehicle", trip.vehicle],
    [
      "Workers",
      trip.dispatch_trip_loaders
        .map((loader) => loader.dispatch_workers?.name)
        .filter(Boolean)
        .join(", ") || null,
    ],
    ["Dispatch date", formatDay(trip.dispatch_date)],
    ["Came back", trip.returned_date ? formatDay(trip.returned_date) : null],
    ["Leaving from", trip.locations?.name],
    ["Created by", trip.profiles?.full_name],
    ["Note", trip.note],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  const manyReturnables =
    new Set(returnLines.map((line) => line.returnable_items?.name)).size > 1;
  // Drinks: empties brought back after the trip, against each order.
  const later = (line: (typeof returnLines)[number]) =>
    line.empties_followups
      .filter((followup) => !followup.voided_at)
      .reduce((sum, followup) => sum + Number(followup.quantity), 0);
  const showLater =
    org.sells_drinks &&
    returnLines.some(
      (line) => Number(line.returned_quantity) < Number(line.expected_quantity),
    );

  return (
    <div className="max-w-3xl space-y-6">
      <div className="page-head">
        <PageTitle sub="Dispatch trip">{trip.trip_no}</PageTitle>
        <TripStatusBadge status={trip.status} />
      </div>

      <Card>
        <dl className="grid gap-4 sm:grid-cols-2">
          {details.map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm font-bold uppercase tracking-wide text-ink-soft">
                {label}
              </dt>
              <dd className="font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {load.size > 0 ? (
        <TableCard title="Loading list">
          <DataTable
            label="Loading list"
            // Drinks: RGB first, then PET.
            rows={[...load.values()].sort(
              (a, b) => Number(b.rgb) - Number(a.rgb) || a.name.localeCompare(b.name),
            )}
            rowKey={(line) => line.name}
            footer={
              returnsDue.size > 0 ? (
                <tr>
                  <td
                    data-phone="title"
                    colSpan={2}
                    className="px-5 py-3 font-extrabold"
                  >
                    To bring back:{" "}
                    {[...returnsDue.entries()]
                      .map(
                        ([name, quantity]) =>
                          `${formatQuantity(quantity)} ${name}`,
                      )
                      .join(", ")}
                  </td>
                </tr>
              ) : null
            }
            columns={[
              {
                header: "Product",
                wrap: true,
                cell: (line) => (
                  <span className="font-extrabold">
                    {line.name}
                    {org.sells_drinks ? (
                      <span className="ml-2 rounded-full bg-chip px-2 py-0.5 text-xs font-bold text-ink-soft">
                        {t(line.rgb ? "RGB" : "PET")}
                      </span>
                    ) : null}
                  </span>
                ),
              },
              {
                header: "Quantity",
                align: "right",
                phone: "badge",
                cell: (line) => (
                  <span className="text-xl font-extrabold">
                    {formatQuantity(line.quantity)}{" "}
                    <span className="text-sm font-medium text-ink-soft">
                      {unitWord(line.quantity, line.unit)}
                    </span>
                  </span>
                ),
              },
            ]}
          />
        </TableCard>
      ) : null}

      <TableCard
        title={
          liveOrders.length === 1 ? "1 order" : `${liveOrders.length} orders`
        }
      >
        <DataTable
          label="Orders on this trip"
          rows={orders}
          rowKey={(order) => order.id}
          rowHref={(order) => `${base}/orders/${order.id}`}
          empty="The orders were sent back to the waiting list when this trip was cancelled."
          columns={[
            {
              header: "Customer",
              wrap: true,
              cell: (order) => (
                <>
                  {order.customers?.name ?? order.buyer_name ?? "Walk-in buyer"}
                  {order.customers?.area ? (
                    <span className="font-medium text-ink-soft">
                      {" "}
                      · {order.customers.area}
                    </span>
                  ) : null}
                </>
              ),
            },
            {
              header: "Status",
              phone: "badge",
              cell: (order) =>
                trip.status === "draft" ? (
                  order.order_items.some((item) => item.returnable_items) ? (
                    <Badge tone="solid">Return due</Badge>
                  ) : null
                ) : (
                  <OrderStatusBadge
                    status={order.status}
                    voided={order.status === "cancelled"}
                  />
                ),
            },
            {
              header: "Order no.",
              cell: (order) => (
                <span className="tabular-nums">{order.order_no}</span>
              ),
            },
            {
              header: "Items",
              align: "right",
              cell: (order) =>
                formatQuantity(
                  order.order_items.reduce(
                    (sum, item) => sum + Number(item.quantity),
                    0,
                  ),
                ),
            },
          ]}
        />
      </TableCard>

      {trip.status === "dispatched" && expectedReturns.length > 0 ? (
        <Card>
          <CardHeader
            title="Record what came back"
            description="Count what each customer brought back and enter it, 0 if none. Every box must be filled."
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
        <TableCard title="What came back">
          <DataTable
            label="What came back"
            rows={returnLines}
            rowKey={(line) => line.id}
            columns={[
              {
                header: "Customer",
                wrap: true,
                cell: (line) => (
                  <span className="font-extrabold">
                    {customerByOrder.get(line.order_id)}
                  </span>
                ),
              },
              {
                header: "Result",
                phone: "badge",
                cell: (line) => {
                  const short =
                    Number(line.expected_quantity) -
                    Number(line.returned_quantity);
                  return short > 0 ? (
                    <Badge tone="accent">
                      Short by {formatQuantity(short)}
                    </Badge>
                  ) : short < 0 ? (
                    <Badge tone="solid">{formatQuantity(-short)} extra</Badge>
                  ) : (
                    <Badge tone="success">All back</Badge>
                  );
                },
              },
              ...(manyReturnables
                ? [
                    {
                      header: "Item",
                      cell: (line: (typeof returnLines)[number]) =>
                        line.returnable_items?.name ?? "",
                    },
                  ]
                : []),
              {
                header: "Expected",
                align: "right",
                cell: (line) => formatQuantity(Number(line.expected_quantity)),
              },
              {
                header: "Returned",
                align: "right",
                cell: (line) => (
                  <>
                    {formatQuantity(Number(line.returned_quantity))}
                    {line.corrected_at ? (
                      <span className="block text-xs font-bold text-ink-soft">
                        corrected
                      </span>
                    ) : null}
                  </>
                ),
              },
              ...(showLater
                ? [
                    {
                      header: "Follow-up",
                      align: "right" as const,
                      cell: (line: (typeof returnLines)[number]) =>
                        formatQuantity(later(line)),
                    },
                    {
                      header: "Still owed",
                      align: "right" as const,
                      cell: (line: (typeof returnLines)[number]) => {
                        const owed = Math.max(
                          Number(line.expected_quantity) -
                            Number(line.returned_quantity) -
                            later(line),
                          0,
                        );
                        return owed > 0 ? (
                          <span className="font-extrabold">
                            {formatQuantity(owed)}
                          </span>
                        ) : (
                          <span className="text-ink-soft">—</span>
                        );
                      },
                    },
                  ]
                : []),
            ]}
          />
        </TableCard>
      ) : null}

      {trip.status === "draft" || (manager && returnLines.length > 0) ? (
        <ActionsPanel>
          {trip.status === "draft" ? (
            <div className="flex flex-wrap items-start gap-3">
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
            </div>
          ) : null}
          {manager
            ? returnLines.map((line) => (
                <ReasonForm
                  key={line.id}
                  compact
                  action={correctTripReturnAction.bind(null, org.slug, line.id)}
                  trigger={`Correct what ${customerByOrder.get(line.order_id)} returned`}
                  explanation="Enter the number that actually came back. The difference moves between the store count and this customer's balance."
                  submitLabel="Save correction"
                  quantity={{
                    label: `Returned by ${customerByOrder.get(line.order_id)}`,
                    current: Number(line.returned_quantity),
                  }}
                />
              ))
            : null}
        </ActionsPanel>
      ) : null}

      <Link href={`${base}/dispatch`} className={buttonClass("secondary")}>
        Back to dispatch
      </Link>
    </div>
  );
}

export default function TripPage({
  params,
}: PageProps<"/b/[slug]/dispatch/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Trip params={params} />
    </Suspense>
  );
}
