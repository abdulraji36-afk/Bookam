import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { Badge, PageSkeleton } from "@/components/ui/card";
import { DataTable, TableCard } from "@/components/ui/data-table";
import { Pager } from "@/components/ui/list-search";
import { FilterBar, PageHeader } from "@/components/ui/page-header";
import { formatQuantity } from "@/lib/format";
import { canManage, requireOrg } from "@/lib/org";
import { readListSearch } from "@/lib/search";
import {
  formatDateTime,
  getShortageLines,
  shortageSummary,
} from "@/lib/shortages";

/** The tab title in the business's own words ("Return shortages" for goods). */
export async function generateMetadata({ params }: PageProps<"/b/[slug]/returns/shortages">): Promise<Metadata> {
  const { slug } = await params;
  const { t } = await requireOrg(slug);
  return { title: t("Empty shortages") };
}

const PAGE_SIZE = 20;
const isDay = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

function Figure({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`rounded-md px-5 py-4 ${strong ? "bg-ink text-white" : "bg-white"}`}
    >
      <p className="text-3xl font-extrabold leading-none tabular-nums sm:text-4xl">
        {value}
      </p>
      <p
        className={`mt-2 text-sm font-bold uppercase tracking-wide ${strong ? "text-nav" : "text-ink-soft"}`}
      >
        {label}
      </p>
    </div>
  );
}

async function Shortages({
  params,
  searchParams,
}: PageProps<"/b/[slug]/returns/shortages">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { supabase, org, role, t } = await requireOrg(slug);
  const base = `/b/${org.slug}`;
  if (!org.sells_drinks) redirect(`${base}/returns`);

  const from = isDay(query.from) ? query.from : "";
  const to = isDay(query.to) ? query.to : "";
  const search = readListSearch(query, PAGE_SIZE);
  const { rows, error } = await getShortageLines(supabase, org.id, {
    from,
    to,
  });
  const summary = shortageSummary(rows);
  const page = rows.slice(search.from, search.to + 1);
  const when = (value: string | null) =>
    formatDateTime(value, org.timezone) ?? (
      <span className="text-ink-soft">—</span>
    );
  const pageHref = (number: number) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (number > 1) params.set("page", String(number));
    const text = params.toString();
    return `${base}/returns/shortages${text ? `?${text}` : ""}`;
  };

  return (
    <div className="space-y-5">
      {query.saved === "followup" ? (
        <Alert tone="success">Follow-up return saved.</Alert>
      ) : null}
      <PageHeader
        title={t("Empty shortages")}
        sub={t("Every order that came back with fewer empties than it took. A line stays here after the customer has brought them all back, marked completed.")}
        actions={
          canManage(role) ? (
            <Link
              href={`${base}/returns/customer-return`}
              className={buttonClass("primary")}
            >
              {t("Customer brought back empties")}
            </Link>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Figure
          label="Shortage records"
          value={formatQuantity(summary.records)}
        />
        <Figure
          label="Open customers"
          value={formatQuantity(summary.openCustomers)}
        />
        <Figure
          label={t("Outstanding empties")}
          value={formatQuantity(summary.outstanding)}
          strong
        />
      </div>

      <FilterBar>
        <form
          method="get"
          action={`${base}/returns/shortages`}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="text-sm font-bold">
            From
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="mt-1.5 block min-h-12 rounded-md border-2 border-field bg-white px-3 text-base font-medium"
            />
          </label>
          <label className="text-sm font-bold">
            To
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="mt-1.5 block min-h-12 rounded-md border-2 border-field bg-white px-3 text-base font-medium"
            />
          </label>
          <button type="submit" className={buttonClass("secondary")}>
            Apply
          </button>
          {from || to ? (
            <Link
              href={`${base}/returns/shortages`}
              className={buttonClass("ghost")}
            >
              Clear dates
            </Link>
          ) : null}
        </form>
      </FilterBar>

      {error ? (
        <Alert tone="error">
          {t("Empty shortages could not load. Please try again.")}
        </Alert>
      ) : null}

      <TableCard title={t("Customer empty shortage history")}>
        <DataTable
          label={t("Empty shortages")}
          rows={page}
          rowKey={(line) => line.id}
          rowHref={(line) => `${base}/orders/${line.order_id}`}
          empty={
            from || to
              ? "No shortages in those dates."
              : "No order has come back short yet."
          }
          columns={[
            {
              header: "Customer",
              wrap: true,
              cell: (line) => (
                <>
                  <span className="block font-extrabold">
                    {line.customer_name}
                  </span>
                  <span className="block whitespace-nowrap text-sm font-medium text-ink-soft tabular-nums">
                    {line.order_no}
                  </span>
                </>
              ),
            },
            {
              header: "Status",
              phone: "badge",
              cell: (line) =>
                Number(line.outstanding) > 0 ? (
                  <Badge tone="solid">Open</Badge>
                ) : (
                  <Badge tone="plain">Completed</Badge>
                ),
            },
            {
              header: "Recorded",
              wrap: true,
              cell: (line) => when(line.returned_at),
            },
            {
              header: "Expected",
              align: "right",
              cell: (line) => formatQuantity(Number(line.expected)),
            },
            {
              header: "With trip",
              align: "right",
              cell: (line) => formatQuantity(Number(line.initial_returned)),
            },
            {
              header: "Follow-up",
              align: "right",
              cell: (line) => formatQuantity(Number(line.followup_returned)),
            },
            {
              header: "Outstanding",
              align: "right",
              cell: (line) => (
                <span className="font-extrabold">
                  {formatQuantity(Number(line.outstanding))}
                </span>
              ),
            },
            {
              header: "Completed on",
              wrap: true,
              cell: (line) => when(line.completed_at),
            },
          ]}
        />
      </TableCard>
      <Pager
        base={`${base}/returns/shortages`}
        search={search}
        total={rows.length}
        hrefFor={pageHref}
      />
    </div>
  );
}

export default function ShortagesPage(
  props: PageProps<"/b/[slug]/returns/shortages">,
) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Shortages {...props} />
    </Suspense>
  );
}
