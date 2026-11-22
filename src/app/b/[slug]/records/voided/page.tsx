import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RecordFilter } from "@/components/records/date-filter";
import { Alert } from "@/components/ui/alert";
import { Badge, EmptyState, PageSkeleton } from "@/components/ui/card";
import { DataTable, TableCard } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { SummaryCard, SummaryCards } from "@/components/ui/summary-card";
import { formatDay, formatQuantity, ORDER_STATUS_LABELS } from "@/lib/format";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";
import { dayOf, formatTime, readDateRange } from "@/lib/records";
import { requestNow } from "@/lib/request-time";
import type { OrderStatus } from "@/types/database";

export const metadata: Metadata = { title: "Voided sales" };

/** Bilikis's Voided Sales: a read-only history of sales an owner or admin reversed. */
async function VoidedSales({
  params,
  searchParams,
}: PageProps<"/b/[slug]/records/voided">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { supabase, org, t } = await requireOrg(slug, MANAGER_ROLES);
  if (!org.sells_drinks) notFound();
  const base = `/b/${org.slug}`;
  const range = readDateRange(query, org.timezone, await requestNow());

  const voided = await supabase
    .from("orders")
    .select("id, order_no, voided_at, voided_by, void_reason, voided_from_status")
    .eq("organization_id", org.id)
    .not("voided_at", "is", null)
    .gte("voided_at", range.start)
    .lt("voided_at", range.end)
    .order("voided_at", { ascending: false })
    .limit(1000);
  const ids = (voided.data ?? []).map((row) => row.id);
  const people = [
    ...new Set(
      (voided.data ?? [])
        .map((row) => row.voided_by)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [summaries, profiles] = await Promise.all([
    ids.length
      ? supabase
          .from("order_summaries")
          .select("id, customer_name, has_returns")
          .in("id", ids)
      : Promise.resolve({ data: [], error: null }),
    people.length
      ? supabase.from("profiles").select("id, full_name, email").in("id", people)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const error = voided.error ?? summaries.error;
  if (error) console.error("Voided sales could not load:", error);
  const summaryById = new Map(
    (summaries.data ?? []).map((row) => [row.id, row]),
  );
  const nameById = new Map(
    (profiles.data ?? []).map((row) => [row.id, row.full_name || row.email]),
  );
  const rows = (voided.data ?? []).map((row) => {
    const summary = summaryById.get(row.id);
    return {
      ...row,
      voided_at: row.voided_at as string,
      type: summary?.has_returns ? "RGB" : "PET",
      customer: summary?.customer_name ?? "—",
      by: row.voided_by ? (nameById.get(row.voided_by) ?? "Admin user") : "Admin user",
    };
  });
  const rgbVoids = rows.filter((row) => row.type === "RGB").length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Voided sales"
        sub={t("Read-only history of PET and RGB sales reversed by an owner or admin.")}
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
        <SummaryCard label="Voided sales" value={formatQuantity(rows.length)} />
        <SummaryCard label={t("PET voids")} value={formatQuantity(rows.length - rgbVoids)} />
        <SummaryCard label={t("RGB voids")} value={formatQuantity(rgbVoids)} />
      </SummaryCards>
      <RecordFilter
        action={`${base}/records/voided`}
        from={range.from}
        to={range.to}
        today={range.today}
      />
      {error ? (
        <Alert tone="error">
          Voided sales could not be loaded. Please refresh the page.
        </Alert>
      ) : rows.length === 0 ? (
        <EmptyState title="No voided sales">
          {t("Voided PET and RGB sales for the selected period will appear here.")}
        </EmptyState>
      ) : (
        <TableCard title="Voided sale history">
          <DataTable
            label="Voided sales"
            rows={rows}
            rowKey={(row) => row.id}
            rowHref={(row) => `${base}/orders/${row.id}`}
            columns={[
              {
                header: "Void date",
                cell: (row) => formatDay(dayOf(row.voided_at, org.timezone)),
              },
              {
                header: "Time",
                cell: (row) => formatTime(row.voided_at, org.timezone),
              },
              {
                header: "Type",
                phone: "badge",
                cell: (row) => <Badge>{t(row.type)}</Badge>,
              },
              {
                header: "Sale no.",
                cell: (row) => <span className="tabular-nums">{row.order_no}</span>,
              },
              { header: "Customer", wrap: true, cell: (row) => row.customer },
              {
                header: "Original status",
                cell: (row) =>
                  row.voided_from_status
                    ? (ORDER_STATUS_LABELS[row.voided_from_status as OrderStatus] ??
                      row.voided_from_status)
                    : "—",
              },
              { header: "Void reason", wrap: true, cell: (row) => row.void_reason ?? "—" },
              { header: "Voided by", wrap: true, cell: (row) => row.by },
            ]}
          />
        </TableCard>
      )}
    </div>
  );
}

export default function Page(props: PageProps<"/b/[slug]/records/voided">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <VoidedSales {...props} />
    </Suspense>
  );
}
