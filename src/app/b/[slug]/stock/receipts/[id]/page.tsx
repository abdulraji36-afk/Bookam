import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { voidStockReceiptAction } from "@/app/actions/corrections";
import { ReasonForm } from "@/components/corrections/reason-form";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader, PageSkeleton, PageTitle } from "@/components/ui/card";
import { describeUnit, formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { canManage, requireOrg } from "@/lib/org";

export const metadata: Metadata = { title: "Stock receipt" };

async function Receipt({ params, searchParams }: PageProps<"/b/[slug]/stock/receipts/[id]">) {
  const [{ slug, id }, query] = await Promise.all([params, searchParams]);
  const { supabase, org, role } = await requireOrg(slug);

  const { data: receipt } = await supabase
    .from("stock_receipts")
    .select(
      "id, receipt_no, received_date, supplier_name, reference, note, voided_at, void_reason, locations (name), profiles!stock_receipts_created_by_fkey (full_name), stock_receipt_items (id, product_id, quantity, products (name, unit)), product_units (id, product_id, serial_no, colour)"
    )
    .eq("organization_id", org.id)
    .eq("id", id)
    .maybeSingle();
  if (!receipt) notFound();

  // The buying cost on each line; only owners and admins can read these.
  const manager = canManage(role);
  const { data: costRows } = manager
    ? await supabase
        .from("stock_receipt_item_costs")
        .select("receipt_item_id, unit_cost")
        .in(
          "receipt_item_id",
          receipt.stock_receipt_items.map((item) => item.id)
        )
    : { data: [] };
  const costByItem = new Map((costRows ?? []).map((row) => [row.receipt_item_id, Number(row.unit_cost)]));

  // Changes made after offloading, newest first.
  const { data: corrections } = await supabase
    .from("stock_receipt_corrections")
    .select("id, old_quantity, new_quantity, reason, created_at, products (name, unit), profiles (full_name)")
    .eq("receipt_id", receipt.id)
    .order("created_at", { ascending: false });

  // Empties the supplier took away with this delivery, if any.
  const { data: exchange } = await supabase
    .from("supplier_exchanges")
    .select("exchange_no, quantity_taken, voided_at, returnable_items (name)")
    .eq("receipt_id", receipt.id)
    .maybeSingle();

  const details = [
    ["Date received", formatDate(receipt.received_date, "UTC")],
    ["Location", receipt.locations?.name],
    ["Supplier", receipt.supplier_name],
    ["Reference", receipt.reference],
    [
      exchange ? `${exchange.returnable_items?.name ?? "Empties"} given to the supplier` : "",
      exchange
        ? `${formatQuantity(Number(exchange.quantity_taken))} (${exchange.exchange_no}${exchange.voided_at ? ", voided" : ""})`
        : null
    ],
    ["Recorded by", receipt.profiles?.full_name],
    ["Note", receipt.note]
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <div className="max-w-3xl space-y-6">
      {query.corrected === "1" && !receipt.voided_at ? (
        <Alert tone="success">Correction saved. Stock and the reports have been updated.</Alert>
      ) : null}
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
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3">
              <span className="font-extrabold">{item.products?.name}</span>
              <span>
                <span className="text-xl font-extrabold tabular-nums">+{formatQuantity(Number(item.quantity))}</span>{" "}
                <span className="font-medium text-ink-soft">{item.products?.unit}</span>
              </span>
              {manager && costByItem.has(item.id) ? (
                <span className="basis-full text-sm font-medium text-ink-soft">
                  Bought at {formatMoney(costByItem.get(item.id)!, org.currency_code)} per {item.products?.unit}
                </span>
              ) : null}
              {receipt.product_units.some((unit) => unit.product_id === item.product_id) ? (
                <ul className="basis-full space-y-1 text-sm font-medium text-ink-soft">
                  {receipt.product_units
                    .filter((unit) => unit.product_id === item.product_id)
                    .sort((a, b) => a.serial_no.localeCompare(b.serial_no))
                    .map((unit) => (
                      <li key={unit.id} className="tabular-nums">
                        {describeUnit(unit)}
                      </li>
                    ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      {(corrections ?? []).length > 0 ? (
        <Card>
          <CardHeader title="Corrections" />
          <ul className="-my-3 divide-y divide-line">
            {(corrections ?? []).map((change) => (
              <li key={change.id} className="py-3">
                <p className="font-extrabold">
                  {change.products?.name}: {formatQuantity(Number(change.old_quantity))} →{" "}
                  {formatQuantity(Number(change.new_quantity))} {change.products?.unit}
                </p>
                <p className="text-sm font-medium text-ink-soft">
                  {[change.reason, change.profiles?.full_name, formatDate(change.created_at, org.timezone)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Link href={`/b/${org.slug}/stock`} className={buttonClass("secondary")}>
          Back to stock
        </Link>
        {manager && !receipt.voided_at && receipt.product_units.length === 0 ? (
          <Link href={`/b/${org.slug}/stock/receipts/${receipt.id}/correct`} className={buttonClass("secondary")}>
            Correct this delivery
          </Link>
        ) : null}
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
