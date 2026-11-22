import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { OrderTable, RgbOrderTable } from "@/components/orders/order-table";
import { Alert } from "@/components/ui/alert";
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
  "id, order_no, order_date, status, customer_name, customer_area, total_quantity, total_amount, has_returns, voided_at, trip_id, trip_no, returnable_quantity, empties_returned, empties_outstanding";
const PAGE_SIZE = 30;

async function Orders({ params, searchParams }: PageProps<"/b/[slug]/orders">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { supabase, org, role, t } = await requireOrg(slug);
  const base = `/b/${org.slug}`;
  const words = saleWords(org.selling_mode);
  const delivers = org.does_delivery;
  const search = readListSearch(query, PAGE_SIZE);
  // Drinks: RGB orders on top and PET orders below, each with its own pages.
  const drinks = org.sells_drinks;
  const petSearch = readListSearch({ ...query, page: query.ppage }, PAGE_SIZE);

  const tabs: {
    value: string;
    label: string;
    statuses: OrderStatus[] | null;
  }[] = [
    { value: "all", label: "All", statuses: null },
    {
      value: "waiting",
      label: delivers ? "Waiting for dispatch" : "Waiting to be collected",
      statuses: ["pending"],
    },
    ...(delivers
      ? [
          {
            value: "trip",
            label: "On a trip",
            statuses: ["assigned"] as OrderStatus[],
          },
          {
            value: "out",
            label: "Out, returns due",
            statuses: ["dispatched"] as OrderStatus[],
          },
        ]
      : []),
    { value: "completed", label: "Completed", statuses: ["completed"] },
    {
      value: "cancelled",
      label: "Cancelled or voided",
      statuses: ["cancelled"],
    },
  ];
  const current = tabs.find((tab) => tab.value === query.status) ?? tabs[0];

  const count = (statuses: OrderStatus[] | null) => {
    let builder = supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id);
    if (statuses) builder = builder.in("status", statuses);
    return builder;
  };
  const list = (
    range: { from: number; to: number },
    returns: boolean | null,
  ) => {
    let builder = supabase
      .from("order_summaries")
      .select(COLUMNS, { count: "exact" })
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .range(range.from, range.to);
    if (returns !== null) builder = builder.eq("has_returns", returns);
    if (current.statuses) builder = builder.in("status", current.statuses);
    if (search.q)
      builder = builder.or(
        matchAny(search.q, [
          "order_no",
          "customer_name",
          "customer_phone",
          "customer_area",
        ]),
      );
    return builder;
  };

  const [listResult, petResult, ...counts] = await Promise.all([
    list(search, drinks ? true : null),
    drinks ? list(petSearch, false) : Promise.resolve({ data: [], count: 0 }),
    ...tabs.map((tab) => count(tab.statuses)),
  ]);
  const rows = listResult.data ?? [];
  const total = listResult.count ?? 0;
  const petRows = petResult.data ?? [];
  const petTotal = petResult.count ?? 0;
  // A failed load must never look like "no orders".
  const loadError =
    ("error" in listResult && listResult.error) ||
    ("error" in petResult && petResult.error);
  if (loadError) console.error("Orders could not load:", loadError);
  const href = (status: string, page = 1, petPage = 1) => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (search.q) params.set("q", search.q);
    if (page > 1) params.set("page", String(page));
    if (petPage > 1) params.set("ppage", String(petPage));
    const text = params.toString();
    return `${base}/orders${text ? `?${text}` : ""}`;
  };
  const waiting = counts[1]?.count ?? 0;
  // After several customers were saved together: offer to put them all on a trip.
  const savedIds =
    query.saved === "batch" && typeof query.ids === "string"
      ? query.ids
          .split(",")
          .filter((value) => /^[0-9a-f-]{36}$/i.test(value))
          .slice(0, 50)
      : [];
  const tripHref = `${base}/dispatch/new?${savedIds.map((value) => `order=${value}`).join("&")}`;

  return (
    <div className="space-y-5">
      {savedIds.length > 0 ? (
        <Alert tone="success">
          <span className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {savedIds.length === 1
                ? "1 order saved."
                : `${savedIds.length} orders saved.`}{" "}
              Their stock has been set aside.
            </span>
            {delivers ? (
              <Link href={tripHref} className={buttonClass("primary", "sm")}>
                Put {savedIds.length === 1 ? "it" : "them"} on a trip
              </Link>
            ) : null}
          </span>
        </Alert>
      ) : null}
      <PageHeader
        title={words.Many}
        sub={`${waiting} ${delivers ? "waiting for dispatch" : "waiting to be collected"}.`}
        actions={
          <>
            <Link
              href={`${base}/orders/new`}
              className={buttonClass("primary")}
            >
              + New {words.one}
            </Link>
            {delivers && waiting > 0 ? (
              <Link
                href={`${base}/dispatch/new`}
                className={buttonClass("secondary")}
              >
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
          tabs={tabs.map((tab, index) => ({
            value: tab.value,
            label: tab.label,
            count: counts[index]?.count ?? 0,
          }))}
        />
      </FilterBar>

      {loadError ? (
        <Alert tone="error">
          Your {words.many} could not be loaded. Please refresh the page. If
          this keeps happening, the database may be missing its latest update.
        </Alert>
      ) : counts[0]?.count === 0 && !search.q ? (
        <EmptyState title={`No ${words.many} yet`}>
          Record the first {words.one} to a customer.
        </EmptyState>
      ) : search.q && rows.length === 0 && petRows.length === 0 ? (
        <NoMatches q={search.q} base={`${base}/orders`} />
      ) : drinks ? (
        <>
          <TableCard title={t("RGB orders")}>
            <RgbOrderTable
              t={t}
              rows={rows}
              base={base}
              currency={org.currency_code}
              showMoney={canManage(role)}
              empty={t("No RGB orders here.")}
            />
          </TableCard>
          <Pager
            base={`${base}/orders`}
            search={search}
            total={total}
            hrefFor={(page) => href(current.value, page, petSearch.page)}
          />
          <TableCard title={t("PET orders")}>
            <OrderTable
              rows={petRows}
              base={base}
              currency={org.currency_code}
              showMoney={canManage(role)}
              delivers={delivers}
              oneWord={words.One}
              empty={t("No PET orders here.")}
            />
          </TableCard>
          <Pager
            base={`${base}/orders`}
            search={petSearch}
            total={petTotal}
            hrefFor={(page) => href(current.value, search.page, page)}
          />
        </>
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
      {drinks ? null : (
        <Pager
          base={`${base}/orders`}
          search={search}
          total={total}
          hrefFor={(page) => href(current.value, page)}
        />
      )}
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
