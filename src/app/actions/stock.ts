"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { describeDbError, type ActionState } from "@/lib/action-state";
import { formatQuantity } from "@/lib/format";
import { notify } from "@/lib/notify";
import { requireOrg } from "@/lib/org";
import { firstIssue, stockReceiptSchema } from "@/lib/validation";

export async function recordStockReceiptAction(
  slug: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, org } = await requireOrg(slug);

  // Lines arrive as parallel productId / quantity fields; blank lines are skipped.
  const productIds = formData.getAll("productId").map(String);
  const quantities = formData.getAll("quantity").map(String);
  const items = productIds
    .map((productId, index) => ({ productId, quantity: quantities[index] ?? "" }))
    .filter((item) => item.productId !== "" || item.quantity.trim() !== "");

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
    p_items: parsed.data.items.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity
    }))
  });

  const receipt = data?.[0];
  if (error || !receipt) return { ok: false, message: describeDbError(error) };

  const total = parsed.data.items.reduce((sum, item) => sum + item.quantity, 0);
  notify({ supabase, org }, () => [
    `Stock received ${receipt.receipt_no}`,
    `${parsed.data.items.length} product${parsed.data.items.length === 1 ? "" : "s"}, ${formatQuantity(total)} items in total`,
    parsed.data.supplierName && `Supplier: ${parsed.data.supplierName}`
  ]);

  revalidatePath(`/b/${slug}`, "layout");
  redirect(`/b/${slug}/stock/receipts/${receipt.id}?saved=1`);
}
