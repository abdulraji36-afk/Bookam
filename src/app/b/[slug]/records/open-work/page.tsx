import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cancelTripAction } from "@/app/actions/orders";
import {
  OrderStatusBadge,
  TripStatusBadge,
} from "@/components/orders/status-badge";
import { ActionButton } from "@/components/team/action-button";
import { Alert } from "@/components/ui/alert";
import { PageSkeleton } from "@/components/ui/card";
import { DataTable, TableCard } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { SummaryCard, SummaryCards } from "@/components/ui/summary-card";
import { formatDay, formatQuantity } from "@/lib/format";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";
import { emptyResult, formatTime } from "@/lib/records";

export const metadata: Metadata = { title: "Incomplete work" };

const ORDER_COLUMNS =
  "id, order_no, order_date, created_at, status, customer_name, total_quantity, returnable_quantity, empties_returned, has_returns, trip_id, trip_no";

/**
 * Bilikis's Incomplete Work: PET and RGB sales and trips that still need
 * someone to act, so an owner or admin can chase them. A draft trip can be
 * cancelled from here; its orders go back to waiting for dispatch.
 */
async function OpenWork({ params }: PageProps<"/b/[slug]/records/open-work">) {
  const { slug } = await params;
  const { supabase, org, t } = await requireOrg(slug, MANAGER_ROLES);
  if (!org.sells_drinks) notFound();
  const base = `/b/${org.slug}`;

  const [orders, trips] = await Promise.all([
    supabase
      .from("order_summaries")
      .select(ORDER_COLUMNS)
      .eq("organization_id", org.id)
      .is("voided_at", null)
      .in("status", ["pending", "assigned", "dispatched"])
      .order("order_date", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1000),
    supabase
      .from("dispatch_trip_summaries")
      .select(
        "id, trip_no, dispatch_date, driver_name, status, order_count, total_quantity, has_returns",
      )
      .eq("organization_id", org.id)
      .in("status", ["draft", "dispatched"])
      .order("dispatch_date", { ascending: true })
      .limit(1000),
  ]);
  const error = orders.error ?? trips.error;
  if (error) console.error("Incomplete work could not load:", error);
  const petSales = (orders.data ?? []).filter((row) => !row.has_returns);
  const rgbSales = (orders.data ?? []).filter((row) => row.has_returns);
  // A trip carrying any RGB order is an RGB trip: its empties must come back.
  const petTrips = (trips.data ?? []).filter(
    (trip) => !trip.has_returns && trip.status === "draft",
  );
  const rgbTrips = (trips.data ?? []).filter((trip) => trip.has_returns);
  const rgbDrafts = rgbTrips.filter((trip) => trip.status === "draft").length;
  const waitingReturns = rgbTrips.length - rgbDrafts;

  const saleColumns = (rgb: boolean) => [
    {
      header: rgb ? "Sale no." : "Sales no.",
      cell: (row: (typeof petSales)[number]) => (
        <span className="tabular-nums">{row.order_no}</span>
      ),
    },
    {
      header: "Date",
      cell: (row: (typeof petSales)[number]) => formatDay(row.order_date),
    },
    {
      header: "Time",
      cell: (row: (typeof petSales)[number]) =>
        formatTime(row.created_at, org.timezone),
    },
    {
      header: "Customer",
      wrap: true,
      cell: (row: (typeof petSales)[number]) => row.customer_name,
    },
    {
      header: rgb ? t("Total crates") : "Total qty",
      align: "right" as const,
      cell: (row: (typeof petSales)[number]) =>
        formatQuantity(Number(row.total_quantity)),
    },
    ...(rgb
      ? [
          {
            header: "Empty result",
            cell: (row: (typeof petSales)[number]) => emptyResult(row),
          },
        ]
      : []),
    {
      header: "Trip",
      cell: (row: (typeof petSales)[number]) => row.trip_no ?? "—",
    },
    {
      header: "Stage",
      phone: "badge" as const,
      cell: (row: (typeof petSales)[number]) => (
        <OrderStatusBadge status={row.status} />
      ),
    },
  ];

  const tripColumns = [
    {
      header: "Trip no.",
      cell: (trip: (typeof rgbTrips)[number]) => (
        <span className="tabular-nums">{trip.trip_no}</span>
      ),
    },
    {
      header: "Date",
      cell: (trip: (typeof rgbTrips)[number]) => formatDay(trip.dispatch_date),
    },
    {
      header: "Driver",
      wrap: true,
      cell: (trip: (typeof rgbTrips)[number]) => trip.driver_name,
    },
    {
      header: "Customers",
      align: "right" as const,
      cell: (trip: (typeof rgbTrips)[number]) => formatQuantity(trip.order_count),
    },
    {
      header: "Quantity",
      align: "right" as const,
      cell: (trip: (typeof rgbTrips)[number]) =>
        formatQuantity(Number(trip.total_quantity)),
    },
    {
      header: "Status",
      phone: "badge" as const,
      cell: (trip: (typeof rgbTrips)[number]) => (
        <TripStatusBadge status={trip.status} />
      ),
    },
    {
      header: "Action",
      cell: (trip: (typeof rgbTrips)[number]) =>
        trip.status === "draft" ? (
          <span className="relative z-10">
            <ActionButton
              action={cancelTripAction.bind(null, org.slug, trip.id)}
              label="Cancel draft"
              pendingLabel="Cancelling…"
              variant="danger"
              size="sm"
              confirmMessage={`Cancel ${trip.trip_no}? Its orders go back to waiting for dispatch.`}
            />
          </span>
        ) : (
          <Link
            href={`${base}/dispatch/${trip.id}`}
            className="relative z-10 text-sm font-bold underline underline-offset-4"
          >
            Record returns
          </Link>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Incomplete work"
        sub={t("Unfinished PET and RGB work that still needs staff action.")}
        actions={
          <Link
            href={`${base}/records`}
            className="text-sm font-bold underline underline-offset-4"
          >
            All records
          </Link>
        }
      />
      <SummaryCards columns={6}>
        <SummaryCard label={t("PET open sales")} value={formatQuantity(petSales.length)} />
        <SummaryCard label={t("PET draft trips")} value={formatQuantity(petTrips.length)} />
        <SummaryCard label={t("RGB open sales")} value={formatQuantity(rgbSales.length)} />
        <SummaryCard label={t("RGB draft trips")} value={formatQuantity(rgbDrafts)} />
        <SummaryCard label={t("RGB waiting returns")} value={formatQuantity(waitingReturns)} />
        <SummaryCard label={t("RGB open trips")} value={formatQuantity(rgbTrips.length)} strong />
      </SummaryCards>

      {error ? (
        <Alert tone="error">
          Incomplete work could not be loaded. Please refresh the page.
        </Alert>
      ) : (
        <>
          <TableCard title={t("PET open sales")}>
            <DataTable
              label={t("PET open sales")}
              rows={petSales}
              rowKey={(row) => row.id}
              rowHref={(row) => `${base}/orders/${row.id}`}
              empty={t("No open PET sales. Every PET sale has gone out.")}
              columns={saleColumns(false)}
            />
          </TableCard>
          <TableCard title={t("PET draft dispatch trips")}>
            <DataTable
              label={t("PET draft dispatch trips")}
              rows={petTrips}
              rowKey={(trip) => trip.id}
              rowHref={(trip) => `${base}/dispatch/${trip.id}`}
              empty={t("No PET draft trips.")}
              columns={tripColumns}
            />
          </TableCard>
          <TableCard title={t("RGB open sales")}>
            <DataTable
              label={t("RGB open sales")}
              rows={rgbSales}
              rowKey={(row) => row.id}
              rowHref={(row) => `${base}/orders/${row.id}`}
              empty={t("No open RGB sales. Every RGB sale has its empties counted.")}
              columns={saleColumns(true)}
            />
          </TableCard>
          <TableCard title={t("RGB open dispatch trips")}>
            <DataTable
              label={t("RGB open dispatch trips")}
              rows={rgbTrips}
              rowKey={(trip) => trip.id}
              rowHref={(trip) => `${base}/dispatch/${trip.id}`}
              empty={t("No incomplete RGB trips.")}
              columns={tripColumns}
            />
          </TableCard>
        </>
      )}
    </div>
  );
}

export default function Page(props: PageProps<"/b/[slug]/records/open-work">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OpenWork {...props} />
    </Suspense>
  );
}
