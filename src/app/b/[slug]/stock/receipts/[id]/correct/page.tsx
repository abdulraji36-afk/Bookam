import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { correctStockReceiptAction } from "@/app/actions/stock";
import { CorrectDeliveryForm } from "@/components/stock/correct-delivery-form";
import { Alert } from "@/components/ui/alert";
import { Card, PageSkeleton, PageTitle } from "@/components/ui/card";
import { todayIn } from "@/lib/format";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Correct a delivery" };

async function CorrectDelivery({ params }: Pick<PageProps<"/b/[slug]/stock/receipts/[id]/correct">, "params">) {
  const { slug, id } = await params;
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);

  const { data: receipt } = await supabase
    .from("stock_receipts")
    .select(
      "id, receipt_no, received_date, supplier_name, reference, note, voided_at, stock_receipt_items (id, product_id, quantity), product_units (id)"
    )
    .eq("organization_id", org.id)
    .eq("id", id)
    .maybeSingle();
  if (!receipt) notFound();

  const [productsResult, costsResult] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, unit")
      .eq("organization_id", org.id)
      .eq("tracks_serials", false)
      .order("name"),
    supabase
      .from("stock_receipt_item_costs")
      .select("receipt_item_id, unit_cost")
      .in(
        "receipt_item_id",
        receipt.stock_receipt_items.map((item) => item.id)
      )
  ]);
  const costs = new Map((costsResult.data ?? []).map((row) => [row.receipt_item_id, Number(row.unit_cost)]));
  const products = productsResult.data ?? [];
  const nameOf = (productId: string) => products.find((product) => product.id === productId)?.name ?? "";
  // Lines in product-name order, so the form reads the same every time.
  const items = [...receipt.stock_receipt_items].sort((x, y) => nameOf(x.product_id).localeCompare(nameOf(y.product_id)));
  const blocked = receipt.voided_at
    ? "This delivery was voided, so it cannot be corrected."
    : receipt.product_units.length > 0
      ? "This delivery has serial numbers. Void it and enter it again instead."
      : null;

  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle sub="Change what was entered, even days later: breakages handed back to the supplier, a wrong count, a product left out, or the wrong date. Stock and the reports follow.">
        Correct {receipt.receipt_no}
      </PageTitle>
      {blocked ? (
        <Alert tone="error">{blocked}</Alert>
      ) : (
        <Card>
          <CorrectDeliveryForm
            action={correctStockReceiptAction.bind(null, org.slug, receipt.id)}
            products={products}
            currency={org.currency_code}
            today={todayIn(org.timezone, await requestNow())}
            referenceRequired={org.sells_drinks}
            defaults={{
              receivedDate: receipt.received_date,
              supplierName: receipt.supplier_name ?? "",
              reference: receipt.reference ?? "",
              note: receipt.note ?? "",
              lines: items.map((item) => ({
                productId: item.product_id,
                quantity: Number(item.quantity),
                cost: costs.get(item.id) ?? null
              }))
            }}
          />
        </Card>
      )}
    </div>
  );
}

export default function CorrectDeliveryPage({ params }: PageProps<"/b/[slug]/stock/receipts/[id]/correct">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CorrectDelivery params={params} />
    </Suspense>
  );
}
