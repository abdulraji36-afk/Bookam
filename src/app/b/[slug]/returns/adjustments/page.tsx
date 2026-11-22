import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { setOpeningEmptiesAction } from "@/app/actions/returns";
import { OpeningEmptiesForm } from "@/components/returns/opening-empties-form";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, CardHeader, PageSkeleton } from "@/components/ui/card";
import { DataTable, TableCard } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { SummaryCard, SummaryCards } from "@/components/ui/summary-card";
import {
  ADD_REASONS,
  formatDay,
  formatQuantity,
  SUBTRACT_REASONS,
  todayIn,
} from "@/lib/format";
import { canManage, requireOrg } from "@/lib/org";
import { formatTime } from "@/lib/records";
import { requestNow } from "@/lib/request-time";
import { getDrinksStock } from "@/lib/returnables";

export const metadata: Metadata = { title: "Empty balance" };

const signed = (value: number) =>
  value > 0
    ? `+${formatQuantity(value)}`
    : value < 0
      ? `−${formatQuantity(-value)}`
      : "0";

/**
 * Bilikis's Empty Balance (owners and admins) and Empty Adjustments (staff):
 * the opening empties, every adjustment to the count, and for owners and
 * admins how the depot's empties add up, with setting the opening count.
 */
async function EmptyBalance({
  params,
}: PageProps<"/b/[slug]/returns/adjustments">) {
  const { slug } = await params;
  const { supabase, org, role } = await requireOrg(slug);
  if (!org.sells_drinks) notFound();
  const base = `/b/${org.slug}`;
  const manager = canManage(role);
  const today = todayIn(org.timezone, await requestNow());

  const [pool, adjustmentsResult, summaryResult, locationsResult] =
    await Promise.all([
      getDrinksStock(supabase, org.id),
      supabase
        .from("returnable_adjustments")
        .select(
          "id, adjustment_date, created_at, quantity_delta, reason, note, voided_at",
        )
        .eq("organization_id", org.id)
        .order("adjustment_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.rpc("empties_summary", {
        p_organization_id: org.id,
        p_date: today,
      }),
      supabase
        .from("locations")
        .select("id, name")
        .eq("organization_id", org.id)
        .eq("is_active", true)
        .order("created_at"),
    ]);
  const error = adjustmentsResult.error ?? summaryResult.error;
  if (error) console.error("Empty balance could not load:", error);

  const labels = new Map<string, string>([
    ...ADD_REASONS,
    ...SUBTRACT_REASONS,
    ["opening_count", "Opening empties"],
  ]);
  const adjustments = adjustmentsResult.data ?? [];
  const live = adjustments.filter((row) => !row.voided_at);
  const opening = live.filter((row) => row.reason === "opening_count");
  const openingTotal = opening.reduce(
    (sum, row) => sum + Number(row.quantity_delta),
    0,
  );
  const added = live
    .filter((row) => Number(row.quantity_delta) > 0)
    .reduce((sum, row) => sum + Number(row.quantity_delta), 0);
  const removed = live
    .filter((row) => Number(row.quantity_delta) < 0)
    .reduce((sum, row) => sum - Number(row.quantity_delta), 0);
  const summary = (summaryResult.data ?? []).find(
    (row) => row.returnable_item_id === pool?.returnableItemId,
  );
  const tripReturns = summary
    ? Number(summary.trip_returns) + Number(summary.followups)
    : 0;
  const otherAdjustments = summary
    ? Number(summary.adjustments) - openingTotal
    : 0;
  const firstOpening = opening[opening.length - 1];

  return (
    <div className="space-y-5">
      <PageHeader
        title={manager ? "Empty balance" : "Empty adjustments"}
        sub={
          manager
            ? "Set the empty crates already on the ground before the depot started here, and keep the count right."
            : "Every adjustment made to the empties count."
        }
        actions={
          manager ? (
            <Link
              href={`${base}/returns/adjust`}
              className={buttonClass("secondary")}
            >
              Record empty adjustment
            </Link>
          ) : null
        }
      />

      {error ? (
        <Alert tone="error">
          The empty balance could not be loaded. Please refresh the page. If
          this keeps happening, the database may be missing its latest update.
        </Alert>
      ) : null}

      {manager ? (
        <SummaryCards columns={5}>
          <SummaryCard label="Opening empties" value={formatQuantity(openingTotal)} />
          <SummaryCard label="Trip returns" value={formatQuantity(tripReturns)} />
          <SummaryCard label="Adjustments" value={signed(otherAdjustments)} />
          <SummaryCard
            label="Supplier handoffs"
            value={formatQuantity(Number(summary?.taken_by_supplier ?? 0))}
          />
          <SummaryCard
            label="Depot empties"
            value={formatQuantity(Number(summary?.in_store ?? 0))}
            strong
          />
        </SummaryCards>
      ) : (
        <SummaryCards columns={3}>
          <SummaryCard label="Adjustment records" value={formatQuantity(live.length)} />
          <SummaryCard label="Empties added" value={formatQuantity(added)} />
          <SummaryCard label="Empties removed" value={formatQuantity(removed)} />
        </SummaryCards>
      )}

      {manager && pool ? (
        <Card>
          <CardHeader
            title="Set opening empties"
            description="Setting it again changes the same opening count; it is not added twice."
          />
          <OpeningEmptiesForm
            action={setOpeningEmptiesAction.bind(null, org.slug)}
            today={today}
            returnableItemId={pool.returnableItemId}
            locations={locationsResult.data ?? []}
            current={
              firstOpening
                ? {
                    quantity: Number(firstOpening.quantity_delta),
                    date: firstOpening.adjustment_date,
                  }
                : null
            }
          />
        </Card>
      ) : null}

      <TableCard title="Adjustment history">
        <DataTable
          label="Adjustment history"
          rows={adjustments}
          rowKey={(row) => row.id}
          rowHref={(row) => `${base}/returns/adjustments/${row.id}`}
          empty="No empty adjustments yet."
          columns={[
            { header: "Date", cell: (row) => formatDay(row.adjustment_date) },
            {
              header: "Time",
              cell: (row) => formatTime(row.created_at, org.timezone),
            },
            {
              header: "Type",
              phone: "badge",
              cell: (row) =>
                row.voided_at ? (
                  <Badge tone="danger">Voided</Badge>
                ) : Number(row.quantity_delta) > 0 ? (
                  <Badge tone="success">Added</Badge>
                ) : (
                  <Badge>Removed</Badge>
                ),
            },
            {
              header: "Qty",
              align: "right",
              cell: (row) => signed(Number(row.quantity_delta)),
            },
            {
              header: "Source",
              wrap: true,
              cell: (row) => labels.get(row.reason) ?? row.reason,
            },
            { header: "Note", wrap: true, cell: (row) => row.note || "—" },
          ]}
        />
      </TableCard>
    </div>
  );
}

export default function Page(
  props: PageProps<"/b/[slug]/returns/adjustments">,
) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EmptyBalance {...props} />
    </Suspense>
  );
}
