import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { createTripAction } from "@/app/actions/orders";
import { TripForm } from "@/components/orders/trip-form";
import { Card, EmptyState, PageSkeleton, PageTitle } from "@/components/ui/card";
import { todayIn } from "@/lib/format";
import { requireOrg } from "@/lib/org";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "New trip" };

async function NewTrip({ params }: Pick<PageProps<"/b/[slug]/dispatch/new">, "params">) {
  const { slug } = await params;
  const { supabase, org } = await requireOrg(slug);

  const [ordersResult, locationsResult] = await Promise.all([
    supabase
      .from("order_summaries")
      .select("id, order_no, customer_name, customer_area, total_quantity, has_returns, location_id")
      .eq("organization_id", org.id)
      .eq("status", "pending")
      .order("created_at"),
    supabase
      .from("locations")
      .select("id, name")
      .eq("organization_id", org.id)
      .eq("is_active", true)
      .order("created_at")
  ]);
  const orders = (ordersResult.data ?? []).map((order) => ({
    id: order.id,
    orderNo: order.order_no,
    customerName: order.customer_name,
    customerArea: order.customer_area,
    totalQuantity: Number(order.total_quantity),
    hasReturns: order.has_returns,
    locationId: order.location_id
  }));

  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle sub="Choose the orders going out together on one vehicle.">New trip</PageTitle>
      {orders.length === 0 ? (
        <EmptyState title="Nothing is waiting">
          <Link
            href={`/b/${org.slug}/orders/new`}
            className="font-extrabold text-ink underline decoration-accent decoration-4 underline-offset-4"
          >
            Record an order first
          </Link>
        </EmptyState>
      ) : (
        <Card>
          <TripForm
            action={createTripAction.bind(null, org.slug)}
            orders={orders}
            locations={locationsResult.data ?? []}
            today={todayIn(org.timezone, await requestNow())}
          />
        </Card>
      )}
    </div>
  );
}

export default function NewTripPage({ params }: PageProps<"/b/[slug]/dispatch/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewTrip params={params} />
    </Suspense>
  );
}
