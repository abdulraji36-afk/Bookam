import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { voidAdjustmentAction } from "@/app/actions/corrections";
import { ReasonForm } from "@/components/corrections/reason-form";
import { RecordDetails } from "@/components/returns/record-details";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, PageSkeleton } from "@/components/ui/card";
import { ActionsPanel, PageHeader } from "@/components/ui/page-header";
import { ADD_REASONS, formatDate, formatDay, formatQuantity, SUBTRACT_REASONS } from "@/lib/format";
import { canManage, requireOrg } from "@/lib/org";

export const metadata: Metadata = { title: "Adjustment" };

async function Adjustment({ params }: Pick<PageProps<"/b/[slug]/returns/adjustments/[id]">, "params">) {
  const { slug, id } = await params;
  const { supabase, org, role } = await requireOrg(slug);
  const { data: adjustment } = await supabase
    .from("returnable_adjustments")
    .select("id, adjustment_date, returnable_item_id, quantity_delta, reason, customer_id, note, created_by, created_at, voided_at, void_reason")
    .eq("organization_id", org.id)
    .eq("id", id)
    .maybeSingle();
  if (!adjustment) notFound();

  const [item, customer, person] = await Promise.all([
    supabase.from("returnable_items").select("name").eq("id", adjustment.returnable_item_id).maybeSingle(),
    adjustment.customer_id
      ? supabase.from("customers").select("name").eq("id", adjustment.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    adjustment.created_by
      ? supabase.from("profiles").select("full_name").eq("id", adjustment.created_by).maybeSingle()
      : Promise.resolve({ data: null })
  ]);
  const labels = new Map<string, string>([...ADD_REASONS, ...SUBTRACT_REASONS]);
  if (org.sells_drinks) labels.set("opening_count", "Opening empties (already in store)");
  const delta = Number(adjustment.quantity_delta);

  return (
    <div className="max-w-3xl space-y-6">
      {adjustment.voided_at ? (
        <Alert tone="error">This adjustment was voided and its effect reversed. Reason: {adjustment.void_reason}</Alert>
      ) : null}
      <PageHeader
        title={`${delta > 0 ? "Added" : "Subtracted"} ${formatQuantity(Math.abs(delta))} ${item.data?.name ?? ""}`}
        sub={labels.get(adjustment.reason)}
        actions={adjustment.voided_at ? <Badge tone="danger">Voided</Badge> : null}
      />
      <Card>
        <RecordDetails
          details={[
            ["Date", formatDay(adjustment.adjustment_date)],
            ["Reason", labels.get(adjustment.reason)],
            ["Customer", customer.data?.name],
            ["Note", adjustment.note],
            ["Recorded by", person.data?.full_name],
            ["Recorded at", formatDate(adjustment.created_at, org.timezone)]
          ]}
        />
      </Card>
      {canManage(role) && !adjustment.voided_at ? (
        <ActionsPanel>
          <ReasonForm
            action={voidAdjustmentAction.bind(null, org.slug, adjustment.id)}
            trigger="Void this adjustment"
            explanation="Use this when the adjustment was recorded by mistake. Its effect on the store count, and on the customer's balance if one was named, is reversed."
            submitLabel="Void adjustment"
          />
        </ActionsPanel>
      ) : null}
      <Link href={`/b/${org.slug}/returns`} className={buttonClass("secondary")}>
        Back to {org.sells_drinks ? "empties" : "returns"}
      </Link>
    </div>
  );
}

export default function AdjustmentPage({ params }: PageProps<"/b/[slug]/returns/adjustments/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Adjustment params={params} />
    </Suspense>
  );
}
