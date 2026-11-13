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
  .min(5, "Give a reason, in at least a few words.")
  .max(500, "Use at most 500 characters for the reason.");

type VoidFunction =
  | "void_order"
  | "void_stock_receipt"
  | "void_supplier_exchange"
  | "void_returnable_adjustment";

const VOIDS: Record<VoidFunction, { argument: string; done: string }> = {
  void_order: { argument: "p_order_id", done: "Order voided. Its stock and returns have been reversed." },
  void_stock_receipt: { argument: "p_receipt_id", done: "Stock receipt voided. Its stock has been taken back out." },
  void_supplier_exchange: { argument: "p_exchange_id", done: "Supplier exchange voided." },
  void_returnable_adjustment: { argument: "p_adjustment_id", done: "Adjustment voided." }
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
  return runVoid("void_order", slug, id, formData);
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
