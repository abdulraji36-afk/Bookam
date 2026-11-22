import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { correctOrderAction, voidEmptiesFollowupAction, voidOrderAction } from "@/app/actions/corrections";
import { CorrectSaleForm } from "@/components/orders/correct-sale-form";
import { getSavedProductOrder, sortByProductMasterOrder } from "@/lib/product-order";
import { cancelOrderAction, handOverOrderAction } from "@/app/actions/orders";
import { recordEmptiesFollowupAction, recordTripReturnsAction } from "@/app/actions/returns";
import { ReasonForm } from "@/components/corrections/reason-form";
import { TripReturnsForm, type ReturnLine } from "@/components/returns/trip-returns-form";
import { FollowupForm } from "@/components/returns/followup-form";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { ActionButton } from "@/components/team/action-button";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, PageSkeleton, PageTitle, CardHeader } from "@/components/ui/card";
import { DataTable, TableCard } from "@/components/ui/data-table";
import { ActionsPanel } from "@/components/ui/page-header";
import { describeUnit, formatDay, formatMoney, formatQuantity, PAYMENT_LABELS, todayIn } from "@/lib/format";
import { canManage, requireOrg } from "@/lib/org";
import { requestNow } from "@/lib/request-time";
import { formatDateTime } from "@/lib/shortages";
import { saleWords } from "@/lib/selling";

export const metadata: Metadata = { title: "Order" };

async function Order({ params, searchParams }: PageProps<"/b/[slug]/orders/[id]">) {
  const [{ slug, id }, query] = await Promise.all([params, searchParams]);
  const { supabase, org, role, t, words: depotWordList } = await requireOrg(slug);
  const base = `/b/${org.slug}`;

  const [orderResult, summaryResult, returnResult] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, order_no, order_date, status, payment_type, note, voided_at, void_reason, buyer_name, buyer_phone, handed_over_at, customers (name, area, phone), locations (name), profiles!orders_created_by_fkey (full_name), order_items (id, product_id, quantity, unit_price, line_total, returnable_item_id, products (name, unit), returnable_items (name)), product_units (id, product_id, serial_no, colour)"
      )
      .eq("organization_id", org.id)
      .eq("id", id)
      .maybeSingle(),
    supabase.from("order_summaries").select("total_amount, trip_id, trip_no").eq("id", id).maybeSingle(),
    // Drinks: what this order brought back, and any follow-ups after the trip.
    org.sells_drinks
      ? supabase
          .from("trip_return_lines")
          .select(
            "id, expected_quantity, returned_quantity, returnable_items (name), dispatch_trips (returned_date, returns_recorded_at), empties_followups (id, quantity, received_date, note, created_at, voided_at, profiles!empties_followups_recorded_by_fkey (full_name))"
          )
          .eq("order_id", id)
      : Promise.resolve({ data: [] })
  ]);
  const order = orderResult.data;
  if (!order) notFound();
  const words = saleWords(org.selling_mode);
  const summary = summaryResult.data;

  const details = [
    [
      "Customer",
      order.customers
        ? [order.customers.name, order.customers.area].filter(Boolean).join(", ")
        : `${order.buyer_name ?? "Walk-in buyer"} (walk-in)`
    ],
    ["Phone", order.customers?.phone ?? order.buyer_phone],
    [
      "Handed over",
      order.handed_over_at
        ? `At the counter, ${new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: org.timezone }).format(new Date(order.handed_over_at))}`
        : null
    ],
    [`${words.One} date`, formatDay(order.order_date)],
    ["Payment", PAYMENT_LABELS[order.payment_type]],
    ["Stock taken from", order.locations?.name],
    ["Recorded by", order.profiles?.full_name],
    ["Note", order.note]
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  // A waiting order is simply cancelled; voiding is for one that has already gone out.
  const canVoid = canManage(role) && order.status !== "cancelled" && order.status !== "pending";
  const returnLines = returnResult.data ?? [];
  // Handed over at the counter and waiting for what comes back: recorded here,
  // the same way a trip's returns are (the order sits on a Counter trip).
  // Handed over at the counter: the order went out on a Counter trip.
  const atCounter = Boolean(order.handed_over_at && summary?.trip_id);
  const counterTrip =
    org.sells_drinks && order.status === "dispatched" && !order.voided_at && summary?.trip_id
      ? (
          await supabase
            .from("dispatch_trips")
            .select("id, driver_name, status, dispatch_date")
            .eq("id", summary.trip_id)
            .eq("driver_name", "Counter")
            .eq("status", "dispatched")
            .maybeSingle()
        ).data
      : null;
  const counterLines: ReturnLine[] = counterTrip
    ? [
        ...order.order_items
          .filter((item) => item.returnable_item_id)
          .reduce((byItem, item) => {
            const key = item.returnable_item_id as string;
            const current = byItem.get(key) ?? {
              orderId: order.id,
              returnableItemId: key,
              customerName: order.customers?.name ?? "Customer",
              returnableName: item.returnable_items?.name ?? depotWordList.pool,
              expected: 0
            };
            current.expected += Number(item.quantity);
            return byItem.set(key, current);
          }, new Map<string, ReturnLine>())
          .values()
      ]
    : [];
  const manager = canManage(role);
  const today = todayIn(org.timezone, await requestNow());
  // Bilikis's admin correction of a drinks sale that has already gone out.
  const isRgb = order.order_items.some((item) => item.returnable_items);
  const canCorrect =
    manager && org.sells_drinks && !order.voided_at && (order.status === "dispatched" || order.status === "completed");
  let correctable: { id: string; name: string }[] = [];
  if (canCorrect) {
    let productQuery = supabase
      .from("products")
      .select("id, name, sku, category")
      .eq("organization_id", org.id)
      .eq("is_active", true)
      .eq("tracks_serials", false);
    productQuery = isRgb
      ? productQuery.not("returnable_item_id", "is", null)
      : productQuery.is("returnable_item_id", null);
    const [{ data: productRows }, saved] = await Promise.all([productQuery, getSavedProductOrder(supabase, org.id)]);
    correctable = sortByProductMasterOrder(productRows ?? [], saved).map((product) => ({ id: product.id, name: product.name }));
  }
  const unitsByProduct = new Map<string, typeof order.product_units>();
  for (const unit of order.product_units) {
    unitsByProduct.set(unit.product_id, [...(unitsByProduct.get(unit.product_id) ?? []), unit]);
  }

  return (
    <div className="max-w-3xl space-y-6">
      {query.saved === "1" ? <Alert tone="success">{words.One} saved. Its stock has been set aside.</Alert> : null}
      {query.saved === "followup" ? <Alert tone="success">Follow-up return saved.</Alert> : null}
      <div className="page-head">
        <PageTitle sub={`Customer ${words.one}`}>{order.order_no}</PageTitle>
        <OrderStatusBadge status={order.status} voided={Boolean(order.voided_at)} delivers={org.does_delivery} />
      </div>

      {order.voided_at ? (
        <Alert tone="error">
          This {words.one} was voided. Its stock and returns were reversed. Reason: {order.void_reason}
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
          {summary?.trip_id && !atCounter ? (
            <div>
              <dt className="text-sm font-bold uppercase tracking-wide text-ink-soft">Dispatch trip</dt>
              <dd>
                <Link
                  href={`${base}/dispatch/${summary.trip_id}`}
                  className="font-extrabold underline decoration-accent decoration-4 underline-offset-4"
                >
                  {summary.trip_no}
                </Link>
              </dd>
            </div>
          ) : null}
        </dl>
      </Card>

      <TableCard title="Products">
        <DataTable
          label="Products"
          rows={order.order_items}
          rowKey={(item) => item.id}
          footer={
            <tr>
              <td data-phone="title" className="px-5 py-3 text-lg font-extrabold">
                Total
              </td>
              <td data-phone="hide" colSpan={order.order_items.some((item) => item.returnable_items) ? 3 : 2} />
              <td data-phone="badge" className="px-5 py-3 text-right text-2xl font-extrabold tabular-nums">
                {formatMoney(Number(summary?.total_amount ?? 0), org.currency_code)}
              </td>
            </tr>
          }
          columns={[
            {
              header: "Product",
              wrap: true,
              cell: (item) => (
                <>
                  <span className="font-extrabold">{item.products?.name}</span>
                  {unitsByProduct.has(item.product_id) ? (
                    <span className="block space-y-0.5 text-sm font-medium text-ink-soft">
                      {unitsByProduct.get(item.product_id)!.map((unit) => (
                        <span key={unit.id} className="block tabular-nums">
                          {describeUnit(unit)}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </>
              )
            },
            {
              header: "Quantity",
              align: "right",
              cell: (item) => `${formatQuantity(Number(item.quantity))} ${item.products?.unit ?? ""}`
            },
            { header: "Price", align: "right", cell: (item) => formatMoney(Number(item.unit_price), org.currency_code) },
            ...(order.order_items.some((item) => item.returnable_items)
              ? [
                  {
                    header: "Due back",
                    cell: (item: (typeof order.order_items)[number]) =>
                      item.returnable_items ? (
                        <Badge tone="solid">
                          {formatQuantity(Number(item.quantity))} {item.returnable_items.name}
                        </Badge>
                      ) : (
                        <span className="text-ink-soft">—</span>
                      )
                  }
                ]
              : []),
            {
              header: "Line total",
              align: "right",
              phone: "badge",
              cell: (item) => <span className="font-extrabold">{formatMoney(Number(item.line_total), org.currency_code)}</span>
            }
          ]}
        />
      </TableCard>

      {counterTrip && counterLines.length > 0 ? (
        <Card>
          <CardHeader
            title={t("Record what came back")}
            description={t("Handed over at the counter. Count the empties the customer brought back and enter it, 0 if none.")}
          />
          <TripReturnsForm
            action={recordTripReturnsAction.bind(null, org.slug, counterTrip.id)}
            lines={counterLines}
            today={today}
            dispatchDate={counterTrip.dispatch_date}
            counter
          />
        </Card>
      ) : null}

      {returnLines.map((line) => {
        const followups = line.empties_followups.filter((followup) => !followup.voided_at);
        const followupTotal = followups.reduce((sum, followup) => sum + Number(followup.quantity), 0);
        const expected = Number(line.expected_quantity);
        const initial = Number(line.returned_quantity);
        const total = initial + followupTotal;
        const outstanding = Math.max(expected - total, 0);
        const difference = total - expected;
        const name = line.returnable_items?.name ?? "Empties";
        const figures: [string, string][] = [
          ["Expected", formatQuantity(expected)],
          ["Total returned", formatQuantity(total)],
          ["Result", difference < 0 ? `Short ${formatQuantity(-difference)}` : difference > 0 ? `Extra ${formatQuantity(difference)}` : "Balanced"]
        ];
        const details: [string, string][] = [
          [atCounter ? "Returned at the counter" : "Returned with the trip", formatQuantity(initial)],
          [atCounter ? "Short at the counter" : "Short at the trip", formatQuantity(Math.max(expected - initial, 0))],
          ["Follow-up returned", formatQuantity(followupTotal)],
          ["Outstanding", formatQuantity(outstanding)],
          [atCounter ? "Return recorded" : "Trip return recorded", formatDateTime(line.dispatch_trips?.returns_recorded_at ?? null, org.timezone) ?? "—"]
        ];
        const shortAtTrip = initial < expected;
        return (
          <section key={line.id} aria-labelledby={`return-${line.id}`} className="space-y-4">
            <Card>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 id={`return-${line.id}`} className="text-xl font-extrabold">
                  {name} return
                </h2>
                {shortAtTrip ? (
                  <Badge tone={outstanding > 0 ? "solid" : "plain"}>{outstanding > 0 ? "Open" : "Completed"}</Badge>
                ) : null}
              </div>
              <dl className="grid grid-cols-3 gap-3">
                {figures.map(([label, value]) => (
                  <div key={label} className="rounded-md bg-canvas px-4 py-3">
                    <dd className="text-2xl font-extrabold tabular-nums">{value}</dd>
                    <dt className="text-xs font-bold uppercase tracking-wide text-ink-soft">{label}</dt>
                  </div>
                ))}
              </dl>
              {shortAtTrip ? (
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  {details.map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-sm font-bold uppercase tracking-wide text-ink-soft">{label}</dt>
                      <dd className="font-semibold tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </Card>

            {line.empties_followups.length > 0 ? (
              <TableCard title="Follow-up history">
                <DataTable
                  label="Follow-up history"
                  rows={line.empties_followups}
                  rowKey={(followup) => followup.id}
                  columns={[
                    { header: "Received", cell: (followup) => formatDay(followup.received_date) },
                    {
                      header: "Quantity",
                      align: "right",
                      phone: "badge",
                      cell: (followup) =>
                        followup.voided_at ? (
                          <Badge tone="plain">Voided</Badge>
                        ) : (
                          <span className="font-extrabold">{formatQuantity(Number(followup.quantity))}</span>
                        )
                    },
                    { header: "Recorded by", cell: (followup) => followup.profiles?.full_name ?? "—" },
                    { header: "Recorded at", wrap: true, cell: (followup) => formatDateTime(followup.created_at, org.timezone) },
                    { header: "Note", wrap: true, cell: (followup) => followup.note ?? <span className="text-ink-soft">—</span> }
                  ]}
                />
              </TableCard>
            ) : null}

            {manager && outstanding > 0 && !order.voided_at ? (
              <Card>
                <h3 className="mb-1 text-lg font-extrabold">Record follow-up return</h3>
                <p className="mb-4 text-sm font-medium text-ink-soft">
                  {formatQuantity(outstanding)} {name.toLowerCase()} still owed on this {words.one}.
                </p>
                <FollowupForm
                  action={recordEmptiesFollowupAction.bind(null, org.slug)}
                  lineId={line.id}
                  outstanding={outstanding}
                  returnedDate={line.dispatch_trips?.returned_date ?? null}
                  today={today}
                />
              </Card>
            ) : null}

            {manager && followups.length > 0 ? (
              <div className="space-y-2">
                {followups.map((followup) => (
                  <ReasonForm
                    key={followup.id}
                    compact
                    action={voidEmptiesFollowupAction.bind(null, org.slug, followup.id)}
                    trigger={`Void the follow-up of ${formatQuantity(Number(followup.quantity))} on ${formatDay(followup.received_date)}`}
                    explanation={t("Use this when the follow-up was recorded by mistake. The customer owes those empties again and they come off the store count.")}
                    submitLabel="Void follow-up"
                  />
                ))}
              </div>
            ) : null}
          </section>
        );
      })}

      {order.status === "pending" || canVoid || canCorrect ? (
        <ActionsPanel>
          {canCorrect ? (
            <CorrectSaleForm
              action={correctOrderAction.bind(null, org.slug, order.id)}
              products={correctable}
              kind={isRgb ? "RGB" : "PET"}
              lines={order.order_items.map((item) => ({ productId: item.product_id, quantity: Number(item.quantity) }))}
            />
          ) : null}
          {order.status === "pending" ? (
            <div className="flex flex-wrap items-start gap-3">
              {org.does_delivery ? (
                <Link href={`${base}/dispatch/new?order=${order.id}`} className={buttonClass("primary")}>
                  Put on a trip
                </Link>
              ) : null}
              <ActionButton
                action={handOverOrderAction.bind(null, org.slug, order.id)}
                label="Handed over now"
                pendingLabel="Saving…"
                variant={org.does_delivery ? "secondary" : "primary"}
                size="md"
                confirmMessage={`Mark ${order.order_no} as collected at the counter? It is completed straight away and will not go on a trip.`}
              />
              <Link href={`${base}/orders/${order.id}/edit`} className={buttonClass("secondary")}>
                Edit {words.one}
              </Link>
              <ActionButton
                action={cancelOrderAction.bind(null, org.slug, order.id)}
                label={`Cancel ${words.one}`}
                pendingLabel="Cancelling…"
                variant="danger"
                size="md"
                confirmMessage={`Cancel ${words.one} ${order.order_no}? Its stock will be put back.`}
              />
            </div>
          ) : null}
          {canVoid ? (
            <ReasonForm
              action={voidOrderAction.bind(null, org.slug, order.id)}
              trigger={`Void this ${words.one}`}
              explanation="Use this when the order should never have been recorded. Its stock goes back, the customer no longer owes anything for it, and any returns recorded against it are taken back out. The order stays on record, marked as voided."
              submitLabel={`Void ${words.one}`}
              confirm={org.sells_drinks ? { label: "Type the sale number to confirm", value: order.order_no } : undefined}
            />
          ) : null}
        </ActionsPanel>
      ) : null}

      <Link href={`${base}/orders`} className={buttonClass("secondary")}>
        Back to {words.many}
      </Link>
    </div>
  );
}

export default function OrderPage(props: PageProps<"/b/[slug]/orders/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Order {...props} />
    </Suspense>
  );
}
