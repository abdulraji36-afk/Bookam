import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { saveOrderAction } from "@/app/actions/orders";
import { OrderForm } from "@/components/orders/order-form";
import { Card, PageSkeleton, PageTitle } from "@/components/ui/card";
import { todayIn } from "@/lib/format";
import { getOrderFormData } from "@/lib/order-form-data";
import { requireOrg } from "@/lib/org";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Edit order" };

async function EditOrder({ params }: Pick<PageProps<"/b/[slug]/orders/[id]/edit">, "params">) {
  const { slug, id } = await params;
  const { supabase, org } = await requireOrg(slug);

  const [orderResult, data] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_no, order_date, status, payment_type, note, customer_id, location_id, order_items (product_id, quantity)")
      .eq("organization_id", org.id)
      .eq("id", id)
      .maybeSingle(),
    getOrderFormData(supabase, org.id)
  ]);
  const order = orderResult.data;
  if (!order) notFound();
  // Only an order still waiting for dispatch can be changed.
  if (order.status !== "pending") redirect(`/b/${org.slug}/orders/${order.id}`);

  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle sub="Changes adjust the stock set aside for this order.">Edit {order.order_no}</PageTitle>
      <Card>
        <OrderForm
          action={saveOrderAction.bind(null, org.slug, order.id)}
          currency={org.currency_code}
          today={todayIn(org.timezone, await requestNow())}
          editing={{
            locationId: order.location_id,
            orderDate: order.order_date,
            customerId: order.customer_id,
            paymentType: order.payment_type,
            note: order.note ?? "",
            lines: order.order_items.map((item) => ({
              productId: item.product_id,
              quantity: Number(item.quantity)
            }))
          }}
          {...data}
        />
      </Card>
    </div>
  );
}

export default function EditOrderPage({ params }: PageProps<"/b/[slug]/orders/[id]/edit">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditOrder params={params} />
    </Suspense>
  );
}
