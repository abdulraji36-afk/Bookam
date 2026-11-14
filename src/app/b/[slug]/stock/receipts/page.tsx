import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, EmptyState, ListCard, PageSkeleton, PageTitle } from "@/components/ui/card";
import { NoMatches, Pager, SearchForm } from "@/components/ui/list-search";
import { formatDate, formatQuantity } from "@/lib/format";
import { requireOrg } from "@/lib/org";
import { matchAny, readListSearch } from "@/lib/search";

export const metadata: Metadata = { title: "Stock received" };

async function Receipts({ params, searchParams }: PageProps<"/b/[slug]/stock/receipts">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { supabase, org } = await requireOrg(slug);
  const base = `/b/${org.slug}/stock/receipts`;
  const search = readListSearch(query, 30);

  let listQuery = supabase
    .from("stock_receipts")
    .select("id, receipt_no, received_date, supplier_name, reference, voided_at, locations (name), stock_receipt_items (quantity)", {
      count: "exact"
    })
    .eq("organization_id", org.id)
    .order("received_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(search.from, search.to);
  if (search.q) listQuery = listQuery.or(matchAny(search.q, ["receipt_no", "supplier_name", "reference"]));
  const { data, count } = await listQuery;
  const receipts = data ?? [];

  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle sub="Every delivery recorded, newest first.">Stock received</PageTitle>
      <SearchForm action={base} q={search.q} label="Search deliveries" placeholder="Search by receipt number, supplier or reference" />

      {receipts.length === 0 ? (
        search.q ? (
          <NoMatches q={search.q} base={base} />
        ) : (
          <EmptyState title="Nothing received yet">Deliveries you record appear here.</EmptyState>
        )
      ) : (
        <ListCard title={search.q ? `Deliveries matching “${search.q}”` : "Deliveries"}>
          <ul className="divide-y divide-line">
            {receipts.map((receipt) => {
              const total = receipt.stock_receipt_items.reduce((sum, item) => sum + Number(item.quantity), 0);
              return (
                <li key={receipt.id}>
                  <Link
                    href={`${base}/${receipt.id}`}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 hover:bg-paper"
                  >
                    <span>
                      <span className="block font-extrabold tabular-nums">{receipt.receipt_no}</span>
                      <span className="text-sm font-medium text-ink-soft">
                        {[
                          formatDate(receipt.received_date, "UTC"),
                          receipt.supplier_name,
                          receipt.reference,
                          receipt.locations?.name
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    {receipt.voided_at ? (
                      <Badge tone="accent">Voided</Badge>
                    ) : (
                      <span className="font-extrabold tabular-nums">+{formatQuantity(total)}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </ListCard>
      )}
      <Pager base={base} search={search} total={count ?? 0} />
    </div>
  );
}

export default function ReceiptsPage(props: PageProps<"/b/[slug]/stock/receipts">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Receipts {...props} />
    </Suspense>
  );
}
