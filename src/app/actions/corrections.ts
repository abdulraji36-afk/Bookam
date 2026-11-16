"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { describeDbError, type ActionState } from "@/lib/action-state";
import { formatQuantity } from "@/lib/format";
import { notify } from "@/lib/notify";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";
import type { ServerClient } from "@/lib/supabase/server";

const idSchema = z.uuid();
const reasonSchema = z
  .string()
  .trim()
  .min(10, "Give a reason of at least 10 characters.")
  .max(500, "Use at most 500 characters for the reason.");

type VoidFunction =
  | "void_order"
  | "void_stock_receipt"
  | "void_supplier_exchange"
  | "void_returnable_adjustment"
  | "void_empties_followup";

const VOIDS: Record<VoidFunction, { argument: string; done: string }> = {
  void_order: { argument: "p_order_id", done: "Order voided. Its stock and returns have been reversed." },
  void_stock_receipt: { argument: "p_receipt_id", done: "Stock receipt voided. Its stock has been taken back out." },
  void_supplier_exchange: { argument: "p_exchange_id", done: "Supplier exchange voided." },
  void_returnable_adjustment: { argument: "p_adjustment_id", done: "Adjustment voided." },
  void_empties_followup: { argument: "p_followup_id", done: "Follow-up return voided. The customer owes those empties again." }
};

/** "order ORD-…", "stock receipt STK-…": what was voided, for the notification. */
async function describeVoided(supabase: ServerClient, fn: VoidFunction, id: string) {
  if (fn === "void_order") {
    const { data } = await supabase.from("orders").select("order_no").eq("id", id).maybeSingle();
    return `order ${data?.order_no ?? ""}`.trim();
  }
  if (fn === "void_stock_receipt") {
    const { data } = await supabase.from("stock_receipts").select("receipt_no").eq("id", id).maybeSingle();
    return `stock receipt ${data?.receipt_no ?? ""}`.trim();
  }
  if (fn === "void_supplier_exchange") {
    const { data } = await supabase.from("supplier_exchanges").select("exchange_no").eq("id", id).maybeSingle();
    return `supplier exchange ${data?.exchange_no ?? ""}`.trim();
  }
  if (fn === "void_empties_followup") return "a follow-up empties return";
  return "a returnables adjustment";
}

async function runVoid(
  fn: VoidFunction,
  slug: string,
  id: string,
  formData: FormData
): Promise<ActionState> {
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);
  if (!idSchema.safeParse(id).success) return { ok: false, message: "Record not found." };

  const reason = reasonSchema.safeParse(formData.get("reason") ?? "");
  if (!reason.success) return { ok: false, message: reason.error.issues[0].message };

  // Each void function takes the record's id under its own argument name.
  const args = { [VOIDS[fn].argument]: id, p_reason: reason.data };
  const { error } = await supabase.rpc(fn, args as never);
  if (error) return { ok: false, message: describeDbError(error) };

  notify({ supabase, org }, async () => [
    `VOIDED: ${await describeVoided(supabase, fn, id)}`,
    `Reason: ${reason.data}`
  ]);
  revalidatePath(`/b/${slug}`, "layout");
  return { ok: true, message: VOIDS[fn].done };
}

export async function voidOrderAction(slug: string, id: string, _previous: ActionState, formData: FormData) {
  // As in Bilikis, a drinks sale is voided only once its number is typed in.
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);
  if (org.sells_drinks) {
    if (!idSchema.safeParse(id).success) return { ok: false, message: "Record not found." };
    const { data } = await supabase.from("orders").select("order_no").eq("id", id).maybeSingle();
    const typed = String(formData.get("confirm") ?? "").trim().toUpperCase();
    if (!data || typed !== data.order_no.toUpperCase()) {
      return { ok: false, message: `Type the sale number ${data?.order_no ?? ""} exactly to void it.`.replace("  ", " ") };
    }
  }
  return runVoid("void_order", slug, id, formData);
}

const correctionLinesSchema = z
  .array(
    z.object({
      product_id: z.uuid("Choose a product on every line."),
      quantity: z.coerce
        .number("Enter a quantity on every line.")
        .int("Crates and packs are counted in whole numbers.")
        .positive("Every line needs a quantity greater than zero.")
        .max(9_999_999, "That quantity is too large.")
    })
  )
  .min(1, "Keep at least one product on the sale. To cancel it, void it instead.")
  .max(200, "A sale can hold up to 200 products.");

/** Bilikis's admin sale correction: products and quantities, in place, with a reason. */
export async function correctOrderAction(
  slug: string,
  orderId: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);
  if (!idSchema.safeParse(orderId).success) return { ok: false, message: "Order not found." };

  const reason = reasonSchema.safeParse(formData.get("reason") ?? "");
  if (!reason.success) return { ok: false, message: reason.error.issues[0].message };

  let lines: unknown;
  try {
    lines = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { ok: false, message: "The product lines could not be read. Refresh the page and try again." };
  }
  const items = correctionLinesSchema.safeParse(lines);
  if (!items.success) return { ok: false, message: items.error.issues[0].message };

  const { error } = await supabase.rpc("correct_order", {
    p_order_id: orderId,
    p_items: items.data,
    p_reason: reason.data
  });
  if (error) return { ok: false, message: describeDbError(error) };

  notify({ supabase, org }, async () => {
    const { data } = await supabase.from("orders").select("order_no").eq("id", orderId).maybeSingle();
    return [`CORRECTED: sale ${data?.order_no ?? ""}`.trim(), `Reason: ${reason.data}`];
  });
  revalidatePath(`/b/${slug}`, "layout");
  return { ok: true, message: "Sale corrected. Stock and empties now follow the new quantities." };
}

export async function voidStockReceiptAction(slug: string, id: string, _previous: ActionState, formData: FormData) {
  return runVoid("void_stock_receipt", slug, id, formData);
}

export async function voidSupplierExchangeAction(slug: string, id: string, _previous: ActionState, formData: FormData) {
  return runVoid("void_supplier_exchange", slug, id, formData);
}

export async function voidAdjustmentAction(slug: string, id: string, _previous: ActionState, formData: FormData) {
  return runVoid("void_returnable_adjustment", slug, id, formData);
}

export async function voidEmptiesFollowupAction(slug: string, id: string, _previous: ActionState, formData: FormData) {
  return runVoid("void_empties_followup", slug, id, formData);
}

export async function correctTripReturnAction(
  slug: string,
  lineId: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);
  if (!idSchema.safeParse(lineId).success) return { ok: false, message: "Return record not found." };

  const reason = reasonSchema.safeParse(formData.get("reason") ?? "");
  if (!reason.success) return { ok: false, message: reason.error.issues[0].message };

  const quantity = z.coerce
    .number("Enter the correct number.")
    .min(0, "The number cannot be less than zero.")
    .max(9_999_999, "That number is too large.")
    .safeParse(String(formData.get("quantity") ?? "").trim() === "" ? undefined : formData.get("quantity"));
  if (!quantity.success) return { ok: false, message: quantity.error.issues[0].message };

  const { error } = await supabase.rpc("correct_trip_return", {
    p_line_id: lineId,
    p_returned_quantity: quantity.data,
    p_reason: reason.data
  });
  if (error) return { ok: false, message: describeDbError(error) };

  notify({ supabase, org }, () => [
    `CORRECTED: a returned figure is now ${formatQuantity(quantity.data)}`,
    `Reason: ${reason.data}`
  ]);
  revalidatePath(`/b/${slug}`, "layout");
  return { ok: true, message: "Figure corrected." };
}

export async function correctAdjustmentAction(
  slug: string,
  adjustmentId: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);
  if (!idSchema.safeParse(adjustmentId).success) return { ok: false, message: "Adjustment not found." };

  const reason = reasonSchema.safeParse(formData.get("reason") ?? "");
  if (!reason.success) return { ok: false, message: reason.error.issues[0].message };

  const quantity = z.coerce
    .number("Enter the correct number.")
    .positive("Enter a number greater than zero. To cancel the adjustment, void it instead.")
    .max(9_999_999, "That number is too large.")
    .safeParse(String(formData.get("quantity") ?? "").trim() === "" ? undefined : formData.get("quantity"));
  if (!quantity.success) return { ok: false, message: quantity.error.issues[0].message };

  const { error } = await supabase.rpc("correct_returnable_adjustment", {
    p_adjustment_id: adjustmentId,
    p_quantity: quantity.data,
    p_reason: reason.data
  });
  if (error) return { ok: false, message: describeDbError(error) };

  notify({ supabase, org }, () => [
    `CORRECTED: an empties adjustment is now ${formatQuantity(quantity.data)}`,
    `Reason: ${reason.data}`
  ]);
  revalidatePath(`/b/${slug}`, "layout");
  return { ok: true, message: "Adjustment corrected." };
}
