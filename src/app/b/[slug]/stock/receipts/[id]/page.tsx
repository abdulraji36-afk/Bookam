import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { voidStockReceiptAction } from "@/app/actions/corrections";
import { ReasonForm } from "@/components/corrections/reason-form";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader, PageSkeleton, PageTitle } from "@/components/ui/card";
import { formatDate, formatQuantity } from "@/lib/format";
import { canManage, requireOrg } from "@/lib/org";

export const metadata: Metadata = { title: "Stock receipt" };

async function Receipt({ params, searchParams }: PageProps<"/b/[slug]/stock/receipts/[id]">) {
  const [{ slug, id }, query] = await Promise.all([params, searchParams]);
  const { supabase, org, role } = await requireOrg(slug);

  const { data: receipt } = await supabase
    .from("stock_receipts")
    .select(
      "id, receipt_no, received_date, supplier_name, reference, note, voided_at, void_reason, locations (name), profiles!stock_receipts_created_by_fkey (full_name), stock_receipt_items (id, quantity, products (name, unit))"
    )
    .eq("organization_id", org.id)
    .eq("id", id)
    .maybeSingle();
  if (!receipt) notFound();

  const details = [
    ["Date received", formatDate(receipt.received_date, "UTC")],
    ["Location", receipt.locations?.name],
    ["Supplier", receipt.supplier_name],
    ["Reference", receipt.reference],
    ["Recorded by", receipt.profiles?.full_name],
    ["Note", receipt.note]
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <div className="max-w-3xl space-y-6">
      {query.saved === "1" && !receipt.voided_at ? (
        <Alert tone="success">Saved. The stock below has been added.</Alert>
      ) : null}
      {receipt.voided_at ? (
        <Alert tone="error">
          This receipt was voided and its stock taken back out. Reason: {receipt.void_reason}
        </Alert>
      ) : null}
      <PageTitle sub="Stock received">{receipt.receipt_no}</PageTitle>

      <Card>
        <dl className="grid gap-4 sm:grid-cols-2">
          {details.map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm font-bold uppercase tracking-wide text-ink-soft">{label}</dt>
              <dd className="font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <CardHeader title="Products received" />
        <ul className="-my-3 divide-y divide-line">
          {receipt.stock_receipt_items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-3">
              <span className="font-extrabold">{item.products?.name}</span>
              <span>
                <span className="text-xl font-extrabold tabular-nums">+{formatQuantity(Number(item.quantity))}</span>{" "}
                <span className="font-medium text-ink-soft">{item.products?.unit}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Link href={`/b/${org.slug}/stock`} className={buttonClass("secondary")}>
          Back to stock
        </Link>
        <Link href={`/b/${org.slug}/stock/receive`} className={buttonClass("primary")}>
          + Receive more
        </Link>
      </div>

      {canManage(role) && !receipt.voided_at ? (
        <ReasonForm
          action={voidStockReceiptAction.bind(null, org.slug, receipt.id)}
          trigger="Void this receipt"
          explanation="Use this when the delivery was recorded by mistake. Its quantities are taken back out of stock. It cannot be voided once that stock has been sold."
          submitLabel="Void receipt"
        />
      ) : null}
    </div>
  );
}

export default function ReceiptPage(props: PageProps<"/b/[slug]/stock/receipts/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Receipt {...props} />
    </Suspense>
  );
}
