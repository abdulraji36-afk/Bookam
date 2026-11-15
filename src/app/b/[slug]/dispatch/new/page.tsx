import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { createTripAction } from "@/app/actions/orders";
import { TripForm } from "@/components/orders/trip-form";
import { Card, EmptyState, PageSkeleton, PageTitle } from "@/components/ui/card";
import { todayIn } from "@/lib/format";
import { canManage, requireOrg } from "@/lib/org";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "New trip" };

const LINK = "font-extrabold text-ink underline decoration-accent decoration-4 underline-offset-4";

async function NewTrip({ params, searchParams }: PageProps<"/b/[slug]/dispatch/new">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { supabase, org, role } = await requireOrg(slug);

  const [ordersResult, locationsResult, workersResult] = await Promise.all([
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
      .order("created_at"),
    supabase
      .from("dispatch_workers")
      .select("id, name, role")
      .eq("organization_id", org.id)
      .eq("is_active", true)
      .order("name")
  ]);
  const workers = workersResult.data ?? [];
  const drivers = workers.filter((worker) => worker.role === "driver").map(({ id, name }) => ({ id, name }));
  const crew = workers.filter((worker) => worker.role === "loader").map(({ id, name }) => ({ id, name }));
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
      <PageTitle sub="Choose the orders going out together, the driver who takes them, and the workers who go along.">
        New trip
      </PageTitle>
      {orders.length === 0 ? (
        <EmptyState title="Nothing is waiting">
          <Link href={`/b/${org.slug}/orders/new`} className={LINK}>
            Record an order first
          </Link>
        </EmptyState>
      ) : drivers.length === 0 || crew.length === 0 ? (
        <EmptyState title={drivers.length === 0 ? "Add your drivers first" : "Add your workers first"}>
          {canManage(role) ? (
            <Link href={`/b/${org.slug}/dispatch/crew`} className={LINK}>
              Add drivers and workers
            </Link>
          ) : (
            "Ask an owner or admin to add the drivers and workers who go out on trips."
          )}
        </EmptyState>
      ) : (
        <Card>
          <TripForm
            action={createTripAction.bind(null, org.slug)}
            orders={orders}
            locations={locationsResult.data ?? []}
            drivers={drivers}
            workers={crew}
            preselected={typeof query.order === "string" ? [query.order] : Array.isArray(query.order) ? query.order : []}
            today={todayIn(org.timezone, await requestNow())}
          />
        </Card>
      )}
    </div>
  );
}

export default function NewTripPage(props: PageProps<"/b/[slug]/dispatch/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewTrip {...props} />
    </Suspense>
  );
}
