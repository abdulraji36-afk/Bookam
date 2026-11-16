import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { Badge, EmptyState, PageSkeleton } from "@/components/ui/card";
import { DataTable, TableCard } from "@/components/ui/data-table";
import { NoMatches, Pager, SearchForm } from "@/components/ui/list-search";
import {
  FilterBar,
  PageHeader,
  StatusTabs,
  StockTabs,
} from "@/components/ui/page-header";
import { formatDate, formatQuantity } from "@/lib/format";
import { requireOrg } from "@/lib/org";
import { matchAny, readListSearch } from "@/lib/search";

export const metadata: Metadata = { title: "Stock in" };

async function Receipts({
  params,
  searchParams,
}: PageProps<"/b/[slug]/stock/receipts">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { supabase, org } = await requireOrg(slug);
  const base = `/b/${org.slug}/stock/receipts`;
  const search = readListSearch(query, 30);
  const showVoided = query.status === "voided";

  let listQuery = supabase
    .from("stock_receipts")
    .select(
      "id, receipt_no, received_date, supplier_name, reference, voided_at, locations (name), stock_receipt_items (quantity), supplier_exchanges (quantity_taken, voided_at)",
      { count: "exact" },
    )
    .eq("organization_id", org.id)
    .order("received_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(search.from, search.to);
  listQuery = showVoided
    ? listQuery.not("voided_at", "is", null)
    : listQuery.is("voided_at", null);
  if (search.q)
    listQuery = listQuery.or(
      matchAny(search.q, ["receipt_no", "supplier_name", "reference"]),
    );

  const [listResult, locationsResult, keptCount, voidedCount] =
    await Promise.all([
      listQuery,
      supabase
        .from("locations")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", org.id),
      supabase
        .from("stock_receipts")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", org.id)
        .is("voided_at", null),
      supabase
        .from("stock_receipts")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", org.id)
        .not("voided_at", "is", null),
    ]);
  const receipts = listResult.data ?? [];
  const { data: corrected } = receipts.length
    ? await supabase
        .from("stock_receipt_corrections")
        .select("receipt_id")
        .in(
          "receipt_id",
          receipts.map((receipt) => receipt.id),
        )
    : { data: [] };
  const correctedIds = new Set((corrected ?? []).map((row) => row.receipt_id));
  const manyLocations = (locationsResult.count ?? 0) > 1;
  const href = (status: string, page = 1) => {
    const params = new URLSearchParams();
    if (status === "voided") params.set("status", "voided");
    if (search.q) params.set("q", search.q);
    if (page > 1) params.set("page", String(page));
    const text = params.toString();
    return `${base}${text ? `?${text}` : ""}`;
  };

  type Receipt = (typeof receipts)[number];
  return (
    <div className="space-y-5">
      <PageHeader
        title="Stock"
        sub="Every time stock came in, newest first. Open one to see it, correct it or void it."
        actions={
          <Link
            href={`/b/${org.slug}/stock/receive`}
            className={buttonClass("primary")}
          >
            + Receive stock
          </Link>
        }
      />
      <StockTabs base={`/b/${org.slug}`} current="stock-in" />
      <FilterBar>
        <SearchForm
          action={base}
          q={search.q}
          label="Search stock in"
          placeholder="Search by delivery number, supplier or reference"
        />
        <StatusTabs
          label="Stock in status"
          current={showVoided ? "voided" : "kept"}
          hrefFor={(value) => href(value)}
          tabs={[
            { value: "kept", label: "Received", count: keptCount.count ?? 0 },
            { value: "voided", label: "Voided", count: voidedCount.count ?? 0 },
          ]}
        />
      </FilterBar>

      {(keptCount.count ?? 0) + (voidedCount.count ?? 0) === 0 ? (
        <EmptyState title="Nothing received yet">
          Stock you receive appears here.
        </EmptyState>
      ) : search.q && receipts.length === 0 ? (
        <NoMatches q={search.q} base={base} />
      ) : (
        <TableCard>
          <DataTable
            label="Stock in"
            rows={receipts}
            rowKey={(receipt: Receipt) => receipt.id}
            rowHref={(receipt: Receipt) => `${base}/${receipt.id}`}
            empty="No stock in here."
            columns={[
              {
                header: "Delivery no.",
                cell: (receipt: Receipt) => (
                  <span className="tabular-nums">{receipt.receipt_no}</span>
                ),
              },
              {
                header: "Status",
                phone: "badge",
                cell: (receipt: Receipt) =>
                  receipt.voided_at ? (
                    <Badge tone="danger">Voided</Badge>
                  ) : correctedIds.has(receipt.id) ? (
                    <Badge tone="accent">Corrected</Badge>
                  ) : (
                    <Badge tone="success">Received</Badge>
                  ),
              },
              {
                header: "Date",
                cell: (receipt: Receipt) =>
                  formatDate(receipt.received_date, "UTC"),
              },
              {
                header: "Supplier",
                wrap: true,
                cell: (receipt: Receipt) =>
                  receipt.supplier_name ?? (
                    <span className="text-ink-soft">—</span>
                  ),
              },
              {
                header: "Reference",
                cell: (receipt: Receipt) =>
                  receipt.reference ?? <span className="text-ink-soft">—</span>,
              },
              ...(manyLocations
                ? [
                    {
                      header: "Location",
                      cell: (receipt: Receipt) => receipt.locations?.name ?? "",
                    },
                  ]
                : []),
              {
                header: "Items",
                align: "right" as const,
                cell: (receipt: Receipt) =>
                  formatQuantity(
                    receipt.stock_receipt_items.reduce(
                      (sum, item) => sum + Number(item.quantity),
                      0,
                    ),
                  ),
              },
              // Only older deliveries carry empties; exchanges are now recorded on their own.
              ...(org.tracks_returns &&
              receipts.some((receipt) => receipt.supplier_exchanges)
                ? [
                    {
                      header: org.sells_drinks
                        ? "Empties given"
                        : "Returnables given",
                      align: "right" as const,
                      cell: (receipt: Receipt) =>
                        receipt.supplier_exchanges &&
                        !receipt.supplier_exchanges.voided_at ? (
                          formatQuantity(
                            Number(receipt.supplier_exchanges.quantity_taken),
                          )
                        ) : (
                          <span className="text-ink-soft">—</span>
                        ),
                    },
                  ]
                : []),
            ]}
          />
        </TableCard>
      )}
      <Pager
        base={base}
        search={search}
        total={listResult.count ?? 0}
        hrefFor={(page) => href(showVoided ? "voided" : "kept", page)}
      />
    </div>
  );
}

export default function ReceiptsPage(
  props: PageProps<"/b/[slug]/stock/receipts">,
) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Receipts {...props} />
    </Suspense>
  );
}
