import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { Badge, PageSkeleton } from "@/components/ui/card";
import { DataTable, TableCard } from "@/components/ui/data-table";
import { Pager, SearchForm } from "@/components/ui/list-search";
import { FilterBar, PageHeader, StatusTabs } from "@/components/ui/page-header";
import { formatDay, formatQuantity } from "@/lib/format";
import { requireOrg } from "@/lib/org";
import { matchAny, readListSearch } from "@/lib/search";

export const metadata: Metadata = { title: "Empty exchanges" };

/** Every time the supplier took empties away, each its own record (like Bilikis's empty exchange history). */
async function Exchanges({
  params,
  searchParams,
}: PageProps<"/b/[slug]/returns/exchanges">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { supabase, org, t } = await requireOrg(slug);
  const base = `/b/${org.slug}/returns/exchanges`;
  const search = readListSearch(query, 30);
  const showVoided = query.status === "voided";
  const title = org.sells_drinks ? t("Empty exchanges") : "Supplier exchanges";

  let listQuery = supabase
    .from("supplier_exchanges")
    .select(
      "id, exchange_no, exchange_date, quantity_taken, crates_delivered, supplier_name, reference, received_by, receipt_id, voided_at, returnable_items (name), locations (name)",
      { count: "exact" },
    )
    .eq("organization_id", org.id)
    .order("exchange_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(search.from, search.to);
  listQuery = showVoided
    ? listQuery.not("voided_at", "is", null)
    : listQuery.is("voided_at", null);
  if (search.q)
    listQuery = listQuery.or(
      matchAny(search.q, [
        "exchange_no",
        "reference",
        "supplier_name",
        "received_by",
      ]),
    );

  const count = (voided: boolean) => {
    const counting = supabase
      .from("supplier_exchanges")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id);
    return voided
      ? counting.not("voided_at", "is", null)
      : counting.is("voided_at", null);
  };
  const [
    { data, count: total, error },
    kept,
    voided,
    { count: locationCount },
  ] = await Promise.all([
    listQuery,
    count(false),
    count(true),
    supabase
      .from("locations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id),
  ]);
  const rows = data ?? [];
  // A failed load must never look like "no exchanges".
  if (error) console.error("Exchanges could not load:", error);
  type Row = (typeof rows)[number];
  const manyLocations = (locationCount ?? 0) > 1;
  const href = (status: string, page = 1) => {
    const params = new URLSearchParams();
    if (status !== "kept") params.set("status", status);
    if (search.q) params.set("q", search.q);
    if (page > 1) params.set("page", String(page));
    const text = params.toString();
    return `${base}${text ? `?${text}` : ""}`;
  };
  const dash = <span className="text-ink-soft">—</span>;

  return (
    <div className="space-y-5">
      <PageHeader
        title={title}
        sub={t("Each time the supplier took empties away. Open one to see its details or void it.")}
        actions={
          <Link
            href={`/b/${org.slug}/returns/exchange`}
            className={buttonClass("primary")}
          >
            + New exchange
          </Link>
        }
      />
      <FilterBar>
        <SearchForm
          action={base}
          q={search.q}
          label="Search exchanges"
          placeholder="Search by exchange number, reference or supplier"
        />
        <StatusTabs
          label="Exchange status"
          current={showVoided ? "voided" : "kept"}
          hrefFor={(value) => href(value)}
          tabs={[
            { value: "kept", label: "Exchanges", count: kept.count ?? 0 },
            { value: "voided", label: "Voided", count: voided.count ?? 0 },
          ]}
        />
      </FilterBar>
      {error ? (
        <Alert tone="error">
          The exchanges could not be loaded. Please refresh the page. If this
          keeps happening, the database may be missing its latest update.
        </Alert>
      ) : null}
      <TableCard>
        <DataTable
          label={title}
          rows={rows}
          rowKey={(row) => row.id}
          rowHref={(row) => `${base}/${row.id}`}
          empty={
            search.q
              ? "No exchange matches that search."
              : showVoided
                ? "No voided exchanges."
                : "No exchanges yet."
          }
          columns={[
            {
              header: "Exchange no.",
              cell: (row) => (
                <span className="font-extrabold tabular-nums">
                  {row.exchange_no}
                </span>
              ),
            },
            {
              header: "Taken",
              align: "right",
              phone: "badge",
              cell: (row) =>
                row.voided_at ? (
                  <Badge tone="danger">Voided</Badge>
                ) : (
                  <Badge tone="solid">
                    {formatQuantity(Number(row.quantity_taken))}{" "}
                    {row.returnable_items?.name ?? ""}
                  </Badge>
                ),
            },
            { header: "Date", cell: (row) => formatDay(row.exchange_date) },
            { header: "Reference", cell: (row) => row.reference ?? dash },
            ...(org.sells_drinks
              ? [
                  {
                    header: t("RGB crates delivered"),
                    align: "right" as const,
                    cell: (row: Row) =>
                      row.crates_delivered === null
                        ? dash
                        : formatQuantity(Number(row.crates_delivered)),
                  },
                ]
              : []),
            { header: "Supplier", cell: (row) => row.supplier_name ?? dash },
            { header: "Received by", cell: (row) => row.received_by ?? dash },
            ...(manyLocations
              ? [
                  {
                    header: "Location",
                    cell: (row: Row) => row.locations?.name ?? "",
                  },
                ]
              : []),
          ]}
        />
      </TableCard>
      <Pager
        base={base}
        search={search}
        total={total ?? 0}
        hrefFor={(page) => href(showVoided ? "voided" : "kept", page)}
      />
    </div>
  );
}

export default function ExchangesPage(
  props: PageProps<"/b/[slug]/returns/exchanges">,
) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Exchanges {...props} />
    </Suspense>
  );
}
