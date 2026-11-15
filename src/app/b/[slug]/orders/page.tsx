import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { OrderTable } from "@/components/orders/order-table";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, PageSkeleton } from "@/components/ui/card";
import { TableCard } from "@/components/ui/data-table";
import { NoMatches, Pager, SearchForm } from "@/components/ui/list-search";
import { FilterBar, PageHeader, StatusTabs } from "@/components/ui/page-header";
import { canManage, requireOrg } from "@/lib/org";
import { matchAny, readListSearch } from "@/lib/search";
import { saleWords } from "@/lib/selling";
import type { OrderStatus } from "@/types/database";

export const metadata: Metadata = { title: "Orders" };

const COLUMNS =
  "id, order_no, order_date, status, customer_name, customer_area, total_quantity, total_amount, has_returns, voided_at, trip_id, trip_no";
const PAGE_SIZE = 30;

async function Orders({ params, searchParams }: PageProps<"/b/[slug]/orders">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { supabase, org, role } = await requireOrg(slug);
  const base = `/b/${org.slug}`;
  const words = saleWords(org.selling_mode);
  const delivers = org.does_delivery;
  const search = readListSearch(query, PAGE_SIZE);

  const tabs: { value: string; label: string; statuses: OrderStatus[] | null }[] = [
    { value: "all", label: "All", statuses: null },
    { value: "waiting", label: delivers ? "Waiting for dispatch" : "Waiting to be collected", statuses: ["pending"] },
    ...(delivers
      ? [
          { value: "trip", label: "On a trip", statuses: ["assigned"] as OrderStatus[] },
          { value: "out", label: "Out, returns due", statuses: ["dispatched"] as OrderStatus[] }
        ]
      : []),
    { value: "completed", label: "Completed", statuses: ["completed"] },
    { value: "cancelled", label: "Cancelled or voided", statuses: ["cancelled"] }
  ];
  const current = tabs.find((tab) => tab.value === query.status) ?? tabs[0];

  const count = (statuses: OrderStatus[] | null) => {
    let builder = supabase.from("orders").select("id", { count: "exact", head: true }).eq("organization_id", org.id);
    if (statuses) builder = builder.in("status", statuses);
    return builder;
  };
  let listQuery = supabase
    .from("order_summaries")
    .select(COLUMNS, { count: "exact" })
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false })
    .range(search.from, search.to);
  if (current.statuses) listQuery = listQuery.in("status", current.statuses);
  if (search.q) listQuery = listQuery.or(matchAny(search.q, ["order_no", "customer_name", "customer_phone", "customer_area"]));

  const [listResult, ...counts] = await Promise.all([listQuery, ...tabs.map((tab) => count(tab.statuses))]);
  const rows = listResult.data ?? [];
  const total = listResult.count ?? 0;
  const href = (status: string, page = 1) => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (search.q) params.set("q", search.q);
    if (page > 1) params.set("page", String(page));
    const text = params.toString();
    return `${base}/orders${text ? `?${text}` : ""}`;
  };
  const waiting = counts[1]?.count ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title={words.Many}
        sub={`${waiting} ${(delivers ? "waiting for dispatch" : "waiting to be collected")}.`}
        actions={
          <>
            <Link href={`${base}/orders/new`} className={buttonClass("primary")}>
              + New {words.one}
            </Link>
            {delivers && waiting > 0 ? (
              <Link href={`${base}/dispatch/new`} className={buttonClass("secondary")}>
                Create trip
              </Link>
            ) : null}
          </>
        }
      />

      <FilterBar>
        <SearchForm
          action={`${base}/orders`}
          q={search.q}
          label={`Search ${words.many}`}
          placeholder={`Search by ${words.one} number, customer, phone or area`}
        />
        <StatusTabs
          label={`${words.One} status`}
          current={current.value}
          hrefFor={(value) => href(value)}
          tabs={tabs.map((tab, index) => ({ value: tab.value, label: tab.label, count: counts[index]?.count ?? 0 }))}
        />
      </FilterBar>

      {counts[0]?.count === 0 && !search.q ? (
        <EmptyState title={`No ${words.many} yet`}>Record the first {words.one} to a customer.</EmptyState>
      ) : search.q && rows.length === 0 ? (
        <NoMatches q={search.q} base={`${base}/orders`} />
      ) : (
        <TableCard>
          <OrderTable
            rows={rows}
            base={base}
            currency={org.currency_code}
            showMoney={canManage(role)}
            delivers={delivers}
            oneWord={words.One}
            empty={`No ${words.many} here.`}
          />
        </TableCard>
      )}
      <Pager base={`${base}/orders`} search={search} total={total} hrefFor={(page) => href(current.value, page)} />
    </div>
  );
}

export default function OrdersPage(props: PageProps<"/b/[slug]/orders">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Orders {...props} />
    </Suspense>
  );
}
