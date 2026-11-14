"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { describeDbError, type ActionState } from "@/lib/action-state";
import { formatQuantity } from "@/lib/format";
import { notify } from "@/lib/notify";
import { requireOrg } from "@/lib/org";
import { firstIssue, readQuantity, stockReceiptSchema } from "@/lib/validation";

export async function recordStockReceiptAction(
  slug: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, org } = await requireOrg(slug);

  // Each line sends lineKey, productId, quantity and tracked, in step. Each
  // serial-numbered unit sends unitLine, serial, colour and condition, in step,
  // with unitLine naming the line it belongs to.
  const field = (name: string) => formData.getAll(name).map(String);
  const [lineKeys, productIds, quantities, tracked] = ["lineKey", "productId", "quantity", "tracked"].map(field);
  const [unitLines, serials, colours, conditions] = ["unitLine", "serial", "colour", "condition"].map(field);

  const items = lineKeys
    .map((key, index) => ({
      productId: productIds[index] ?? "",
      tracked: tracked[index] === "1",
      quantity: readQuantity(quantities[index]),
      units: unitLines.flatMap((line, unit) =>
        // A trailing empty row (left by a scanner pressing Enter) is ignored.
        line === key && (serials[unit] ?? "").trim() !== ""
          ? [{ serial: serials[unit], colour: colours[unit] ?? "", condition: conditions[unit] ?? "" }]
          : []
      )
    }))
    .filter((item) => item.productId !== "" || item.quantity !== undefined || item.units.length > 0);

  const parsed = stockReceiptSchema.safeParse({
    locationId: formData.get("locationId") ?? "",
    receivedDate: formData.get("receivedDate") ?? "",
    supplierName: formData.get("supplierName") ?? "",
    reference: formData.get("reference") ?? "",
    note: formData.get("note") ?? "",
    items
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  const { data, error } = await supabase.rpc("record_stock_receipt", {
    p_organization_id: org.id,
    p_location_id: parsed.data.locationId,
    p_received_date: parsed.data.receivedDate,
    p_supplier_name: parsed.data.supplierName || null,
    p_reference: parsed.data.reference || null,
    p_note: parsed.data.note || null,
    p_items: parsed.data.items.map((item) =>
      item.tracked
        ? {
            product_id: item.productId,
            units: item.units.map((unit) => ({
              serial: unit.serial,
              colour: unit.colour || null,
              condition: unit.condition
            }))
          }
        : { product_id: item.productId, quantity: item.quantity ?? 0 }
    )
  });

  const receipt = data?.[0];
  if (error || !receipt) return { ok: false, message: describeDbError(error) };

  const total = parsed.data.items.reduce(
    (sum, item) => sum + (item.tracked ? item.units.length : (item.quantity ?? 0)),
    0
  );
  notify({ supabase, org }, () => [
    `Stock received ${receipt.receipt_no}`,
    `${parsed.data.items.length} product${parsed.data.items.length === 1 ? "" : "s"}, ${formatQuantity(total)} items in total`,
    parsed.data.supplierName && `Supplier: ${parsed.data.supplierName}`
  ]);

  revalidatePath(`/b/${slug}`, "layout");
  redirect(`/b/${slug}/stock/receipts/${receipt.id}?saved=1`);
}
