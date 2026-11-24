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

async function Exchange({ params, searchParams }: PageProps<"/b/[slug]/returns/exchanges/[id]">) {
  const [{ slug, id }, query] = await Promise.all([params, searchParams]);
  const { supabase, org, role, t } = await requireOrg(slug);
  const { data: exchange } = await supabase
    .from("supplier_exchanges")
    .select(
      "id, exchange_no, exchange_date, quantity_taken, crates_delivered, supplier_name, reference, received_by, note, receipt_id, created_by, created_at, voided_at, void_reason, returnable_items (name)"
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
      {query.saved === "1" ? (
        <Alert tone="success">Exchange saved. The {name.toLowerCase()} taken are off your store count.</Alert>
      ) : null}
      {exchange.voided_at ? (
        <Alert tone="error">This exchange was voided and the {name.toLowerCase()} put back. Reason: {exchange.void_reason}</Alert>
      ) : null}
      <PageHeader
        title={exchange.exchange_no}
        sub={t(`${formatQuantity(Number(exchange.quantity_taken))} ${name} taken by the supplier`)}
        actions={exchange.voided_at ? <Badge tone="danger">Voided</Badge> : null}
      />
      <Card>
        <RecordDetails
          details={[
            ["Date", formatDay(exchange.exchange_date)],
            ["Reference", exchange.reference],
            [
              t("RGB crates delivered"),
              exchange.crates_delivered === null ? null : formatQuantity(Number(exchange.crates_delivered))
            ],
            [`${name} taken by the supplier`, `${formatQuantity(Number(exchange.quantity_taken))} ${name}`],
            ["Supplier", exchange.supplier_name],
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
            trigger={t("Void this exchange")}
            explanation={t(`Use this when the exchange was recorded by mistake. The ${name.toLowerCase()} go back into the store count.`)}
            submitLabel={t("Void exchange")}
          />
        </ActionsPanel>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Link href={`/b/${org.slug}/returns/exchanges`} className={buttonClass("secondary")}>
          {t("Back to all exchanges")}
        </Link>
        <Link href={`/b/${org.slug}/returns/exchange`} className={buttonClass("ghost")}>
          {t("Record another exchange")}
        </Link>
      </div>
    </div>
  );
}

export default function ExchangePage(props: PageProps<"/b/[slug]/returns/exchanges/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Exchange {...props} />
    </Suspense>
  );
}
