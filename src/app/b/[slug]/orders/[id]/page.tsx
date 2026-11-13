import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { voidOrderAction } from "@/app/actions/corrections";
import { cancelOrderAction } from "@/app/actions/orders";
import { ReasonForm } from "@/components/corrections/reason-form";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { ActionButton } from "@/components/team/action-button";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, CardHeader, PageSkeleton, PageTitle } from "@/components/ui/card";
import { formatDay, formatMoney, formatQuantity, PAYMENT_LABELS } from "@/lib/format";
import { canManage, requireOrg } from "@/lib/org";

export const metadata: Metadata = { title: "Order" };

async function Order({ params, searchParams }: PageProps<"/b/[slug]/orders/[id]">) {
  const [{ slug, id }, query] = await Promise.all([params, searchParams]);
  const { supabase, org, role } = await requireOrg(slug);
  const base = `/b/${org.slug}`;

  const [orderResult, summaryResult] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, order_no, order_date, status, payment_type, note, voided_at, void_reason, customers (name, area, phone), locations (name), profiles!orders_created_by_fkey (full_name), order_items (id, quantity, unit_price, line_total, products (name, unit), returnable_items (name))"
      )
      .eq("organization_id", org.id)
      .eq("id", id)
      .maybeSingle(),
    supabase.from("order_summaries").select("total_amount, trip_id, trip_no").eq("id", id).maybeSingle()
  ]);
  const order = orderResult.data;
  if (!order) notFound();
  const summary = summaryResult.data;

  const details = [
    ["Customer", [order.customers?.name, order.customers?.area].filter(Boolean).join(", ")],
    ["Phone", order.customers?.phone],
    ["Order date", formatDay(order.order_date)],
    ["Payment", PAYMENT_LABELS[order.payment_type]],
    ["Stock taken from", order.locations?.name],
    ["Recorded by", order.profiles?.full_name],
    ["Note", order.note]
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <div className="max-w-3xl space-y-6">
      {query.saved === "1" ? <Alert tone="success">Order saved. Its stock has been set aside.</Alert> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle sub="Customer order">{order.order_no}</PageTitle>
        <OrderStatusBadge status={order.status} voided={Boolean(order.voided_at)} />
      </div>

      {order.voided_at ? (
        <Alert tone="error">
          This order was voided. Its stock and returns were reversed. Reason: {order.void_reason}
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
          {summary?.trip_id ? (
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

      <Card>
        <CardHeader title="Products" />
        <ul className="-my-3 divide-y divide-line">
          {order.order_items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
              <span className="min-w-0">
                <span className="block font-extrabold">{item.products?.name}</span>
                <span className="text-sm font-medium text-ink-soft">
                  {formatQuantity(Number(item.quantity))} {item.products?.unit} ×{" "}
                  {formatMoney(Number(item.unit_price), org.currency_code)}
                </span>
              </span>
              <span className="flex items-center gap-3">
                {item.returnable_items ? (
                  <Badge tone="solid">
                    {formatQuantity(Number(item.quantity))} {item.returnable_items.name} due back
                  </Badge>
                ) : null}
                <span className="text-lg font-extrabold tabular-nums">
                  {formatMoney(Number(item.line_total), org.currency_code)}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-5 flex items-baseline justify-between gap-3 border-t-[3px] border-ink pt-3">
          <span className="text-lg font-extrabold uppercase tracking-wide">Total</span>
          <span className="text-3xl font-extrabold tabular-nums">
            {formatMoney(Number(summary?.total_amount ?? 0), org.currency_code)}
          </span>
        </p>
      </Card>

      <div className="flex flex-wrap items-start gap-3">
        <Link href={`${base}/orders`} className={buttonClass("secondary")}>
          Back to orders
        </Link>
        {order.status === "pending" ? (
          <>
            <Link href={`${base}/orders/${order.id}/edit`} className={buttonClass("secondary")}>
              Edit order
            </Link>
            <ActionButton
              action={cancelOrderAction.bind(null, org.slug, order.id)}
              label="Cancel order"
              pendingLabel="Cancelling…"
              variant="danger"
              size="md"
              confirmMessage={`Cancel order ${order.order_no}? Its stock will be put back.`}
            />
          </>
        ) : null}
      </div>

      {canManage(role) && order.status !== "cancelled" ? (
        <ReasonForm
          action={voidOrderAction.bind(null, org.slug, order.id)}
          trigger="Void this order"
          explanation="Use this when the order should never have been recorded. Its stock goes back, the customer no longer owes anything for it, and any returns recorded against it are taken back out. The order stays on record, marked as voided."
          submitLabel="Void order"
        />
      ) : null}
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
