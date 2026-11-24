import Link from "next/link";
import { notFound } from "next/navigation";
import { RecordFilter } from "@/components/records/date-filter";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/card";
import { DataTable, TableCard } from "@/components/ui/data-table";
import { Pager } from "@/components/ui/list-search";
import { PageHeader } from "@/components/ui/page-header";
import { SummaryCard, SummaryCards } from "@/components/ui/summary-card";
import { formatDay, formatQuantity } from "@/lib/format";
import { requireOrg } from "@/lib/org";
import {
  emptyResult,
  formatTime,
  readCustomer,
  readDateRange,
  recordHref,
} from "@/lib/records";
import { requestNow } from "@/lib/request-time";
import { readListSearch } from "@/lib/search";

type Query = Record<string, string | string[] | undefined>;
const PAGE_SIZE = 20;

/**
 * Bilikis's RGB and PET transaction history: the sales that went out to
 * customers in a date range. RGB sales show once their empties are counted
 * (or while they are out); PET sales once their trip has left.
 */
export async function SalesHistory({
  slug,
  query,
  kind,
}: {
  slug: string;
  query: Query;
  kind: "RGB" | "PET";
}) {
  const { supabase, org, t } = await requireOrg(slug);
  if (!org.sells_drinks) notFound();
  const base = `/b/${org.slug}`;
  const path = `${base}/records/${kind.toLowerCase()}`;
  const range = readDateRange(query, org.timezone, await requestNow());
  const customer = readCustomer(query);
  const page = readListSearch(query, PAGE_SIZE);
  const rgb = kind === "RGB";
  // How this depot says it: RGB / PET for drinks, Returnable / Non-returnable for goods.
  const label = t(kind);

  const matching = (columns: string) => {
    let builder = supabase
      .from("order_summaries")
      .select(columns, { count: "exact" })
      .eq("organization_id", org.id)
      .eq("has_returns", rgb)
      .is("voided_at", null)
      .in("status", rgb ? ["dispatched", "completed"] : ["completed"])
      .gte("order_date", range.from)
      .lte("order_date", range.to);
    if (customer) builder = builder.eq("customer_id", customer);
    return builder;
  };

  // Totals over the whole range, a thousand rows at a time.
  const totals = async () => {
    let quantity = 0;
    for (let from = 0; ; from += 1000) {
      const { data, error } = await matching("total_quantity").range(
        from,
        from + 999,
      );
      if (error) return { quantity: 0, error };
      const batch = (data ?? []) as unknown as { total_quantity: number }[];
      quantity += batch.reduce((sum, row) => sum + Number(row.total_quantity), 0);
      if (batch.length < 1000) return { quantity, error: null };
    }
  };

  const [list, total, customers] = await Promise.all([
    matching(
      "id, order_no, order_date, created_at, status, customer_name, total_quantity, returnable_quantity, empties_returned, trip_id, trip_no",
    )
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(page.from, page.to),
    totals(),
    supabase
      .from("customers")
      .select("id, name")
      .eq("organization_id", org.id)
      .order("name"),
  ]);
  const error = list.error ?? total.error ?? customers.error;
  if (error) console.error(`${kind} history could not load:`, error);
  const rows = (list.data ?? []) as unknown as {
    id: string;
    order_no: string;
    order_date: string;
    created_at: string;
    status: string;
    customer_name: string;
    total_quantity: number;
    returnable_quantity: number;
    empties_returned: number | null;
    trip_id: string | null;
    trip_no: string | null;
  }[];
  const records = list.count ?? 0;
  const filters = { from: range.from, to: range.to, customer };

  return (
    <div className="space-y-5">
      <PageHeader
        title={rgb ? t("RGB transaction history") : t("PET transaction history")}
        sub={
          rgb
            ? t("RGB sales delivered to customers, with how their empties came back.")
            : t("PET sales delivered to customers.")
        }
        actions={
          <Link
            href={`${base}/records`}
            className="text-sm font-bold underline underline-offset-4"
          >
            All records
          </Link>
        }
      />
      <SummaryCards columns={3}>
        <SummaryCard
          label={rgb ? "Customer deliveries" : "Transactions"}
          value={formatQuantity(records)}
        />
        <SummaryCard
          label={rgb ? t("Crates delivered") : t("PET sold")}
          value={formatQuantity(total.quantity)}
        />
      </SummaryCards>
      <RecordFilter
        action={path}
        from={range.from}
        to={range.to}
        today={range.today}
        customers={customers.data ?? []}
        customer={customer}
      />
      {error ? (
        <Alert tone="error">
          This history could not be loaded. Please refresh the page. If this
          keeps happening, the database may be missing its latest update.
        </Alert>
      ) : rows.length === 0 ? (
        <EmptyState title={t(`No ${kind} sales`)}>
          {label} sales delivered between {formatDay(range.from)} and{" "}
          {formatDay(range.to)} will appear here.
        </EmptyState>
      ) : (
        <TableCard
          title={`${label} sales, ${formatDay(range.from)} to ${formatDay(range.to)}`}
        >
          <DataTable
            label={`${label} sales`}
            rows={rows}
            rowKey={(row) => row.id}
            rowHref={(row) => `${base}/orders/${row.id}`}
            columns={[
              {
                header: "Date",
                cell: (row) => formatDay(row.order_date),
              },
              {
                header: "Time",
                cell: (row) => formatTime(row.created_at, org.timezone),
              },
              {
                header: "Customer",
                wrap: true,
                cell: (row) => row.customer_name,
              },
              {
                header: rgb ? t("Total crates") : "Total qty",
                align: "right",
                cell: (row) => formatQuantity(Number(row.total_quantity)),
              },
              ...(rgb
                ? [
                    {
                      header: "Empty result",
                      cell: (row: (typeof rows)[number]) => emptyResult(row),
                    },
                  ]
                : []),
              {
                header: rgb ? "Sale no." : "Sales no.",
                cell: (row) => (
                  <span className="tabular-nums">{row.order_no}</span>
                ),
              },
              {
                header: "Dispatch trip",
                cell: (row) => row.trip_no ?? "—",
              },
            ]}
          />
        </TableCard>
      )}
      <Pager
        base={path}
        search={page}
        total={records}
        hrefFor={(number) => recordHref(path, { ...filters, page: number })}
      />
    </div>
  );
}
