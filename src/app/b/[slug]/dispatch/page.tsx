import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TripStatusBadge } from "@/components/orders/status-badge";
import { buttonClass } from "@/components/ui/button";
import { Badge, EmptyState, PageSkeleton } from "@/components/ui/card";
import { DataTable, TableCard } from "@/components/ui/data-table";
import { NoMatches, Pager, SearchForm } from "@/components/ui/list-search";
import { FilterBar, PageHeader, StatusTabs } from "@/components/ui/page-header";
import { formatDay, formatQuantity } from "@/lib/format";
import { requireOrg } from "@/lib/org";
import { matchAny, readListSearch } from "@/lib/search";
import type { TripStatus } from "@/types/database";

export const metadata: Metadata = { title: "Dispatch" };

const COLUMNS = "id, trip_no, dispatch_date, driver_name, vehicle, status, order_count, total_quantity, has_returns";

type TripRow = {
  id: string;
  trip_no: string;
  dispatch_date: string;
  driver_name: string;
  vehicle: string | null;
  status: TripStatus;
  order_count: number;
  total_quantity: number;
  has_returns: boolean;
};

async function Dispatch({ params, searchParams }: PageProps<"/b/[slug]/dispatch">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { supabase, org } = await requireOrg(slug);
  const base = `/b/${org.slug}`;
  const search = readListSearch(query, 30);

  const tabs: { value: string; label: string; statuses: TripStatus[] | null }[] = [
    { value: "all", label: "All", statuses: null },
    { value: "loading", label: "Loading", statuses: ["draft"] },
    { value: "out", label: "Out, returns due", statuses: ["dispatched"] },
    { value: "completed", label: "Completed", statuses: ["completed"] },
    { value: "cancelled", label: "Cancelled", statuses: ["cancelled"] }
  ];
  const current = tabs.find((tab) => tab.value === query.status) ?? tabs[0];

  let listQuery = supabase
    .from("dispatch_trip_summaries")
    .select(COLUMNS, { count: "exact" })
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false })
    .range(search.from, search.to);
  if (current.statuses) listQuery = listQuery.in("status", current.statuses);
  if (search.q) listQuery = listQuery.or(matchAny(search.q, ["trip_no", "driver_name"]));

  const count = (statuses: TripStatus[] | null) => {
    let builder = supabase.from("dispatch_trips").select("id", { count: "exact", head: true }).eq("organization_id", org.id);
    if (statuses) builder = builder.in("status", statuses);
    return builder;
  };
  const [listResult, waitingResult, ...counts] = await Promise.all([
    listQuery,
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("status", "pending"),
    ...tabs.map((tab) => count(tab.statuses))
  ]);
  const rows: TripRow[] = listResult.data ?? [];
  const waiting = waitingResult.count ?? 0;
  const href = (status: string, page = 1) => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (search.q) params.set("q", search.q);
    if (page > 1) params.set("page", String(page));
    const text = params.toString();
    return `${base}/dispatch${text ? `?${text}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dispatch"
        sub={`${waiting} order${waiting === 1 ? "" : "s"} waiting to be put on a trip.`}
        actions={
          <>
            <Link href={`${base}/dispatch/new`} className={buttonClass("primary")}>
              + New trip
            </Link>
            <Link href={`${base}/dispatch/crew`} className={buttonClass("secondary")}>
              Drivers and workers
            </Link>
          </>
        }
      />

      <FilterBar>
        <SearchForm action={`${base}/dispatch`} q={search.q} label="Search trips" placeholder="Search by trip number or driver" />
        <StatusTabs
          label="Trip status"
          current={current.value}
          hrefFor={(value) => href(value)}
          tabs={tabs.map((tab, index) => ({ value: tab.value, label: tab.label, count: counts[index]?.count ?? 0 }))}
        />
      </FilterBar>

      {counts[0]?.count === 0 && !search.q ? (
        <EmptyState title="No trips yet">Record some orders, then group them onto a trip to send them out.</EmptyState>
      ) : search.q && rows.length === 0 ? (
        <NoMatches q={search.q} base={`${base}/dispatch`} />
      ) : (
        <TableCard>
          <DataTable
            label="Trips"
            rows={rows}
            rowKey={(trip) => trip.id}
            rowHref={(trip) => `${base}/dispatch/${trip.id}`}
            empty="No trips here."
            columns={[
              { header: "Trip no.", cell: (trip) => <span className="tabular-nums">{trip.trip_no}</span> },
              { header: "Status", phone: "badge", cell: (trip) => <TripStatusBadge status={trip.status} /> },
              { header: "Date", cell: (trip) => formatDay(trip.dispatch_date) },
              { header: "Driver", cell: (trip) => <span className="font-semibold">{trip.driver_name}</span> },
              { header: "Orders", align: "right", cell: (trip) => trip.order_count },
              { header: "Items", align: "right", cell: (trip) => formatQuantity(Number(trip.total_quantity)) },
              {
                header: "Returns",
                cell: (trip) =>
                  trip.has_returns ? (
                    <Badge tone={trip.status === "dispatched" ? "accent" : "plain"}>
                      {trip.status === "dispatched" ? "Due back" : "Yes"}
                    </Badge>
                  ) : (
                    <span className="text-ink-soft">—</span>
                  )
              }
            ]}
          />
        </TableCard>
      )}
      <Pager base={`${base}/dispatch`} search={search} total={listResult.count ?? 0} hrefFor={(page) => href(current.value, page)} />
    </div>
  );
}

export default function DispatchPage(props: PageProps<"/b/[slug]/dispatch">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dispatch {...props} />
    </Suspense>
  );
}
