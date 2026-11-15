"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { describeDbError, type ActionState } from "@/lib/action-state";
import { formatQuantity } from "@/lib/format";
import { notify } from "@/lib/notify";
import { requireOrg } from "@/lib/org";
import { z } from "zod";
import { MANAGER_ROLES } from "@/lib/org";
import { firstIssue, readQuantity, stockReceiptSchema } from "@/lib/validation";

export async function recordStockReceiptAction(
  slug: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, org } = await requireOrg(slug);

  // Each line sends lineKey, productId, quantity and tracked, in step. Each
  // serial-numbered unit sends unitLine, serial and colour, in step,
  // with unitLine naming the line it belongs to.
  const field = (name: string) => formData.getAll(name).map(String);
  const [lineKeys, productIds, quantities, tracked] = ["lineKey", "productId", "quantity", "tracked"].map(field);
  const [unitLines, serials, colours] = ["unitLine", "serial", "colour"].map(field);

  const items = lineKeys
    .map((key, index) => ({
      productId: productIds[index] ?? "",
      tracked: tracked[index] === "1",
      quantity: readQuantity(quantities[index]),
      units: unitLines.flatMap((line, unit) =>
        // A trailing empty row (left by a scanner pressing Enter) is ignored.
        line === key && (serials[unit] ?? "").trim() !== ""
          ? [{ serial: serials[unit], colour: colours[unit] ?? "" }]
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

  const receiptArgs = {
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
              colour: unit.colour || null
            }))
          }
        : { product_id: item.productId, quantity: item.quantity ?? 0 }
    )
  };

  // Drinks: the supplier's reference is required. Empties the supplier takes
  // are recorded on their own, as an empty exchange.
  const { data, error } = org.sells_drinks
    ? await supabase.rpc("record_stock_delivery", { ...receiptArgs, p_empties_given: 0, p_returnable_item_id: null })
    : await supabase.rpc("record_stock_receipt", receiptArgs);

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

/** Owners and admins correct the buying cost recorded on one delivery line. */
export async function setReceiptItemCostAction(
  slug: string,
  receiptItemId: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase } = await requireOrg(slug, MANAGER_ROLES);
  if (!z.uuid().safeParse(receiptItemId).success) return { ok: false, message: "Delivery line not found." };
  const cost = readQuantity(String(formData.get("unitCost") ?? ""));
  if (cost === undefined || cost < 0) return { ok: false, message: "Enter the buying cost, zero or more." };

  const { error } = await supabase.rpc("set_receipt_item_cost", { p_receipt_item_id: receiptItemId, p_unit_cost: cost });
  if (error) return { ok: false, message: describeDbError(error) };

  revalidatePath(`/b/${slug}`, "layout");
  return { ok: true, message: "Cost saved." };
}

/**
 * Owners and admins correct a delivery after the fact, as in Bilikis: date,
 * supplier, reference, note and its products. The database rewrites its stock
 * lines at the delivery date and refuses anything that leaves stock below zero.
 */
export async function correctStockReceiptAction(
  slug: string,
  receiptId: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase } = await requireOrg(slug, MANAGER_ROLES);
  if (!z.uuid().safeParse(receiptId).success) return { ok: false, message: "Delivery not found." };

  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 10) return { ok: false, message: "Give a reason of at least 10 characters." };
  const receivedDate = String(formData.get("receivedDate") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedDate)) return { ok: false, message: "Enter the date the stock arrived." };

  const productIds = formData.getAll("productId").map(String);
  const quantities = formData.getAll("quantity").map(String);
  const costs = formData.getAll("unitCost").map(String);
  const items = [];
  for (let index = 0; index < productIds.length; index++) {
    if (!productIds[index] && !quantities[index]?.trim()) continue;
    if (!z.uuid().safeParse(productIds[index]).success) return { ok: false, message: `Choose the product on line ${index + 1}.` };
    const quantity = readQuantity(quantities[index] ?? "");
    if (quantity === undefined || quantity <= 0) {
      return { ok: false, message: `Enter a quantity greater than zero on line ${index + 1}.` };
    }
    const costText = (costs[index] ?? "").trim();
    const unitCost = costText === "" ? null : readQuantity(costText);
    if (unitCost === undefined || (unitCost !== null && unitCost < 0)) {
      return { ok: false, message: `Enter a cost of zero or more on line ${index + 1}, or leave it empty.` };
    }
    items.push({ product_id: productIds[index], quantity, unit_cost: unitCost });
  }
  if (items.length === 0) return { ok: false, message: "A delivery needs at least one product. To cancel it, void it instead." };

  const { error } = await supabase.rpc("correct_stock_receipt", {
    p_receipt_id: receiptId,
    p_received_date: receivedDate,
    p_supplier_name: String(formData.get("supplierName") ?? "") || null,
    p_reference: String(formData.get("reference") ?? "") || null,
    p_note: String(formData.get("note") ?? "") || null,
    p_items: items,
    p_reason: reason
  });
  if (error) return { ok: false, message: describeDbError(error) };

  revalidatePath(`/b/${slug}`, "layout");
  redirect(`/b/${slug}/stock/receipts/${receiptId}?corrected=1`);
}
