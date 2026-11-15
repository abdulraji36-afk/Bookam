import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { voidSupplierExchangeAction } from "@/app/actions/corrections";
import { ReasonForm } from "@/components/corrections/reason-form";
import { RecordDetails } from "@/components/returns/record-details";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, PageSkeleton } from "@/components/ui/card";
import { ActionsPanel, PageHeader } from "@/components/ui/page-header";
import { formatDate, formatDay, formatQuantity } from "@/lib/format";
import { canManage, requireOrg } from "@/lib/org";

export const metadata: Metadata = { title: "Supplier exchange" };

async function Exchange({ params }: Pick<PageProps<"/b/[slug]/returns/exchanges/[id]">, "params">) {
  const { slug, id } = await params;
  const { supabase, org, role } = await requireOrg(slug);
  const { data: exchange } = await supabase
    .from("supplier_exchanges")
    .select(
      "id, exchange_no, exchange_date, quantity_taken, supplier_name, reference, received_by, note, receipt_id, created_by, created_at, voided_at, void_reason, returnable_items (name)"
    )
    .eq("organization_id", org.id)
    .eq("id", id)
    .maybeSingle();
  if (!exchange) notFound();
  const { data: person } = exchange.created_by
    ? await supabase.from("profiles").select("full_name").eq("id", exchange.created_by).maybeSingle()
    : { data: null };
  const name = exchange.returnable_items?.name ?? "Empties";

  return (
    <div className="max-w-3xl space-y-6">
      {exchange.voided_at ? (
        <Alert tone="error">This exchange was voided and the {name.toLowerCase()} put back. Reason: {exchange.void_reason}</Alert>
      ) : null}
      <PageHeader
        title={exchange.exchange_no}
        sub={`${formatQuantity(Number(exchange.quantity_taken))} ${name} taken by the supplier`}
        actions={exchange.voided_at ? <Badge tone="danger">Voided</Badge> : null}
      />
      <Card>
        <RecordDetails
          details={[
            ["Date", formatDay(exchange.exchange_date)],
            ["Taken", `${formatQuantity(Number(exchange.quantity_taken))} ${name}`],
            ["Supplier", exchange.supplier_name],
            ["Reference", exchange.reference],
            ["Received by", exchange.received_by],
            ["Note", exchange.note],
            ["Recorded by", person?.full_name],
            ["Recorded at", formatDate(exchange.created_at, org.timezone)]
          ]}
        />
        {exchange.receipt_id ? (
          <Link
            href={`/b/${org.slug}/stock/receipts/${exchange.receipt_id}`}
            className="mt-4 inline-block font-extrabold underline decoration-accent decoration-4 underline-offset-4"
          >
            Open the delivery this came with
          </Link>
        ) : null}
      </Card>
      {canManage(role) && !exchange.voided_at ? (
        <ActionsPanel>
          <ReasonForm
            action={voidSupplierExchangeAction.bind(null, org.slug, exchange.id)}
            trigger="Void this exchange"
            explanation={`Use this when the exchange was recorded by mistake. The ${name.toLowerCase()} go back into the store count.`}
            submitLabel="Void exchange"
          />
        </ActionsPanel>
      ) : null}
      <Link href={`/b/${org.slug}/returns`} className={buttonClass("secondary")}>
        Back to {org.sells_drinks ? "empties" : "returns"}
      </Link>
    </div>
  );
}

export default function ExchangePage({ params }: PageProps<"/b/[slug]/returns/exchanges/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Exchange params={params} />
    </Suspense>
  );
}
