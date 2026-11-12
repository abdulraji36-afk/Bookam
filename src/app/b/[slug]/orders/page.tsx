import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { OrderRow } from "@/components/orders/order-row";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, ListCard, PageSkeleton, PageTitle } from "@/components/ui/card";
import { requireOrg } from "@/lib/org";

export const metadata: Metadata = { title: "Orders" };

const COLUMNS =
  "id, order_no, order_date, status, customer_name, customer_area, total_quantity, total_amount, has_returns";

async function Orders({ params }: Pick<PageProps<"/b/[slug]/orders">, "params">) {
  const { slug } = await params;
  const { supabase, org } = await requireOrg(slug);
  const base = `/b/${org.slug}`;

  const [waitingResult, recentResult] = await Promise.all([
    supabase
      .from("order_summaries")
      .select(COLUMNS)
      .eq("organization_id", org.id)
      .eq("status", "pending")
      .order("created_at"),
    supabase
      .from("order_summaries")
      .select(COLUMNS)
      .eq("organization_id", org.id)
      .neq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(30)
  ]);
  const waiting = waitingResult.data ?? [];
  const recent = recentResult.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle sub={`${waiting.length} waiting for dispatch.`}>Orders</PageTitle>
        <Link href={`${base}/orders/new`} className={buttonClass("primary")}>
          + New order
        </Link>
      </div>

      {waiting.length === 0 && recent.length === 0 ? (
        <EmptyState title="No orders yet">Record the first order a customer places.</EmptyState>
      ) : null}

      {waiting.length > 0 ? (
        <ListCard
          title="Waiting for dispatch"
          action={
            <Link href={`${base}/dispatch/new`} className={buttonClass("secondary", "sm")}>
              Create trip
            </Link>
          }
        >
          <ul className="divide-y divide-line">
            {waiting.map((order) => (
              <OrderRow key={order.id} order={order} base={base} currency={org.currency_code} />
            ))}
          </ul>
        </ListCard>
      ) : null}

      {recent.length > 0 ? (
        <ListCard title="Recent orders">
          <ul className="divide-y divide-line">
            {recent.map((order) => (
              <OrderRow key={order.id} order={order} base={base} currency={org.currency_code} />
            ))}
          </ul>
        </ListCard>
      ) : null}
    </div>
  );
}

export default function OrdersPage({ params }: PageProps<"/b/[slug]/orders">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Orders params={params} />
    </Suspense>
  );
}
