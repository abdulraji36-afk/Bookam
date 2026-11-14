import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { OrderRow } from "@/components/orders/order-row";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, ListCard, PageSkeleton, PageTitle } from "@/components/ui/card";
import { NoMatches, Pager, SearchForm } from "@/components/ui/list-search";
import { requireOrg } from "@/lib/org";
import { matchAny, readListSearch } from "@/lib/search";
import { saleWords } from "@/lib/selling";

export const metadata: Metadata = { title: "Orders" };

const COLUMNS =
  "id, order_no, order_date, status, customer_name, customer_area, total_quantity, total_amount, has_returns, voided_at";

const PAGE_SIZE = 30;

async function Orders({ params, searchParams }: PageProps<"/b/[slug]/orders">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { supabase, org } = await requireOrg(slug);
  const base = `/b/${org.slug}`;
  const search = readListSearch(query, PAGE_SIZE);
  // Searching, or past the first page, shows one plain list of every order.
  const listOnly = Boolean(search.q) || search.page > 1;

  let listQuery = supabase
    .from("order_summaries")
    .select(COLUMNS, { count: "exact" })
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false })
    .range(search.from, search.to);
  if (search.q) listQuery = listQuery.or(matchAny(search.q, ["order_no", "customer_name", "customer_phone", "customer_area"]));
  else listQuery = listQuery.neq("status", "pending");

  const [waitingResult, listResult] = await Promise.all([
    listOnly
      ? Promise.resolve({ data: [] })
      : supabase.from("order_summaries").select(COLUMNS).eq("organization_id", org.id).eq("status", "pending").order("created_at"),
    listQuery
  ]);
  const waiting = waitingResult.data ?? [];
  const list = listResult.data ?? [];
  const total = listResult.count ?? 0;
  const words = saleWords(org.selling_mode);
  const delivers = org.does_delivery;
  const waitingTitle = delivers ? "Waiting for dispatch" : "Waiting to be collected";

  return (
    <div className="space-y-6">
      <div className="page-head">
        <PageTitle
          sub={listOnly ? `Every ${words.one}, newest first.` : `${waiting.length} ${waitingTitle.toLowerCase()}.`}
        >
          {words.Many}
        </PageTitle>
        <Link href={`${base}/orders/new`} className={buttonClass("primary")}>
          + New {words.one}
        </Link>
      </div>

      <SearchForm
        action={`${base}/orders`}
        q={search.q}
        label={`Search ${words.many}`}
        placeholder={`Search by ${words.one} number, customer, phone or area`}
      />

      {!search.q && waiting.length === 0 && list.length === 0 && search.page === 1 ? (
        <EmptyState title={`No ${words.many} yet`}>Record the first {words.one} to a customer.</EmptyState>
      ) : null}
      {search.q && list.length === 0 ? <NoMatches q={search.q} base={`${base}/orders`} /> : null}

      {waiting.length > 0 ? (
        <ListCard
          title={waitingTitle}
          action={
            delivers ? (
              <Link href={`${base}/dispatch/new`} className={buttonClass("secondary", "sm")}>
                Create trip
              </Link>
            ) : undefined
          }
        >
          <ul className="divide-y divide-line">
            {waiting.map((order) => (
              <OrderRow key={order.id} order={order} base={base} currency={org.currency_code} delivers={delivers} />
            ))}
          </ul>
        </ListCard>
      ) : null}

      {list.length > 0 ? (
        <ListCard
          title={search.q ? `${words.Many} matching “${search.q}”` : listOnly ? words.Many : `Recent ${words.many}`}
        >
          <ul className="divide-y divide-line">
            {list.map((order) => (
              <OrderRow key={order.id} order={order} base={base} currency={org.currency_code} delivers={delivers} />
            ))}
          </ul>
        </ListCard>
      ) : null}
      <Pager base={`${base}/orders`} search={search} total={total} />
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
