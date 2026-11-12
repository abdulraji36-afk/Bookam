import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TripStatusBadge } from "@/components/orders/status-badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, ListCard, PageSkeleton, PageTitle } from "@/components/ui/card";
import { formatDay, formatQuantity } from "@/lib/format";
import { requireOrg } from "@/lib/org";
import type { TripStatus } from "@/types/database";

export const metadata: Metadata = { title: "Dispatch" };

type TripRowData = {
  id: string;
  trip_no: string;
  dispatch_date: string;
  driver_name: string;
  vehicle: string | null;
  status: TripStatus;
  order_count: number;
  total_quantity: number;
};

const COLUMNS = "id, trip_no, dispatch_date, driver_name, vehicle, status, order_count, total_quantity";

function TripRow({ trip, base }: { trip: TripRowData; base: string }) {
  return (
    <li>
      <Link
        href={`${base}/dispatch/${trip.id}`}
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4 hover:bg-paper"
      >
        <span className="min-w-0">
          <span className="block text-lg font-extrabold">
            {trip.driver_name}
            {trip.vehicle ? ` · ${trip.vehicle}` : ""}
          </span>
          <span className="font-medium text-ink-soft">
            {trip.trip_no} · {formatDay(trip.dispatch_date)} · {trip.order_count} order
            {trip.order_count === 1 ? "" : "s"} · {formatQuantity(Number(trip.total_quantity))} items
          </span>
        </span>
        <TripStatusBadge status={trip.status} />
      </Link>
    </li>
  );
}

async function Dispatch({ params }: Pick<PageProps<"/b/[slug]/dispatch">, "params">) {
  const { slug } = await params;
  const { supabase, org } = await requireOrg(slug);
  const base = `/b/${org.slug}`;

  const [draftResult, recentResult, waitingResult] = await Promise.all([
    supabase
      .from("dispatch_trip_summaries")
      .select(COLUMNS)
      .eq("organization_id", org.id)
      .eq("status", "draft")
      .order("created_at"),
    supabase
      .from("dispatch_trip_summaries")
      .select(COLUMNS)
      .eq("organization_id", org.id)
      .neq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("status", "pending")
  ]);
  const drafts = draftResult.data ?? [];
  const recent = recentResult.data ?? [];
  const waiting = waitingResult.count ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle sub={`${waiting} order${waiting === 1 ? "" : "s"} waiting to be put on a trip.`}>
          Dispatch
        </PageTitle>
        <Link href={`${base}/dispatch/new`} className={buttonClass("primary")}>
          + New trip
        </Link>
      </div>

      {drafts.length === 0 && recent.length === 0 ? (
        <EmptyState title="No trips yet">
          Record some orders, then group them onto a trip to send them out.
        </EmptyState>
      ) : null}

      {drafts.length > 0 ? (
        <ListCard title="Loading now">
          <ul className="divide-y divide-line">
            {drafts.map((trip) => (
              <TripRow key={trip.id} trip={trip} base={base} />
            ))}
          </ul>
        </ListCard>
      ) : null}

      {recent.length > 0 ? (
        <ListCard title="Recent trips">
          <ul className="divide-y divide-line">
            {recent.map((trip) => (
              <TripRow key={trip.id} trip={trip} base={base} />
            ))}
          </ul>
        </ListCard>
      ) : null}
    </div>
  );
}

export default function DispatchPage({ params }: PageProps<"/b/[slug]/dispatch">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dispatch params={params} />
    </Suspense>
  );
}
