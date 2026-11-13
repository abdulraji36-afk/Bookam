"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { describeDbError, type ActionState } from "@/lib/action-state";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";
import {
  firstIssue,
  openingDebtSchema,
  returnableAdjustmentSchema,
  supplierExchangeSchema,
  tripReturnsSchema
} from "@/lib/validation";

const idSchema = z.uuid();
const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

export async function recordTripReturnsAction(
  slug: string,
  tripId: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase } = await requireOrg(slug);
  if (!idSchema.safeParse(tripId).success) return { ok: false, message: "Trip not found." };

  // One row per customer and returnable item, sent as parallel fields.
  const orderIds = formData.getAll("orderId").map(String);
  const returnableIds = formData.getAll("returnableItemId").map(String);
  const quantities = formData.getAll("returned").map(String);

  const parsed = tripReturnsSchema.safeParse({
    returnedDate: text(formData, "returnedDate"),
    returns: orderIds.map((orderId, index) => ({
      orderId,
      returnableItemId: returnableIds[index] ?? "",
      quantity: quantities[index]?.trim() === "" ? undefined : quantities[index]
    }))
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  const { error } = await supabase.rpc("record_trip_returns", {
    p_trip_id: tripId,
    p_returned_date: parsed.data.returnedDate,
    p_returns: parsed.data.returns.map((line) => ({
      order_id: line.orderId,
      returnable_item_id: line.returnableItemId,
      quantity: line.quantity
    }))
  });
  if (error) return { ok: false, message: describeDbError(error) };

  revalidatePath(`/b/${slug}`, "layout");
  return { ok: true, message: "Returns recorded. The trip is complete." };
}

export async function recordSupplierExchangeAction(
  slug: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, org } = await requireOrg(slug);

  const parsed = supplierExchangeSchema.safeParse({
    locationId: text(formData, "locationId"),
    exchangeDate: text(formData, "exchangeDate"),
    returnableItemId: text(formData, "returnableItemId"),
    quantity: text(formData, "quantity"),
    supplierName: text(formData, "supplierName"),
    reference: text(formData, "reference"),
    receivedBy: text(formData, "receivedBy"),
    note: text(formData, "note")
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  const { data, error } = await supabase.rpc("record_supplier_exchange", {
    p_organization_id: org.id,
    p_location_id: parsed.data.locationId,
    p_exchange_date: parsed.data.exchangeDate,
    p_returnable_item_id: parsed.data.returnableItemId,
    p_quantity: parsed.data.quantity,
    p_supplier_name: parsed.data.supplierName || null,
    p_reference: parsed.data.reference || null,
    p_received_by: parsed.data.receivedBy || null,
    p_note: parsed.data.note || null
  });
  const exchange = data?.[0];
  if (error || !exchange) return { ok: false, message: describeDbError(error) };

  revalidatePath(`/b/${slug}`, "layout");
  redirect(`/b/${slug}/returns?saved=${encodeURIComponent(exchange.exchange_no)}`);
}

export async function recordAdjustmentAction(
  slug: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);

  const parsed = returnableAdjustmentSchema.safeParse({
    locationId: text(formData, "locationId"),
    adjustmentDate: text(formData, "adjustmentDate"),
    returnableItemId: text(formData, "returnableItemId"),
    direction: text(formData, "direction"),
    quantity: text(formData, "quantity"),
    reason: text(formData, "reason"),
    customerId: text(formData, "customerId"),
    note: text(formData, "note")
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  const { error } = await supabase.rpc("record_returnable_adjustment", {
    p_organization_id: org.id,
    p_location_id: parsed.data.locationId,
    p_adjustment_date: parsed.data.adjustmentDate,
    p_returnable_item_id: parsed.data.returnableItemId,
    p_direction: parsed.data.direction,
    p_quantity: parsed.data.quantity,
    p_reason: parsed.data.reason,
    p_customer_id: parsed.data.customerId || null,
    p_note: parsed.data.note || null
  });
  if (error) return { ok: false, message: describeDbError(error) };

  revalidatePath(`/b/${slug}`, "layout");
  redirect(`/b/${slug}/returns?saved=adjustment`);
}

export async function recordOpeningDebtAction(
  slug: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);

  const parsed = openingDebtSchema.safeParse({
    customerId: text(formData, "customerId"),
    returnableItemId: text(formData, "returnableItemId"),
    quantity: text(formData, "quantity"),
    note: text(formData, "note")
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  const { error } = await supabase.rpc("record_customer_opening_debt", {
    p_organization_id: org.id,
    p_customer_id: parsed.data.customerId,
    p_returnable_item_id: parsed.data.returnableItemId,
    p_quantity: parsed.data.quantity,
    p_note: parsed.data.note || null
  });
  if (error) return { ok: false, message: describeDbError(error) };

  revalidatePath(`/b/${slug}`, "layout");
  return { ok: true, message: "Old debt recorded on the customer's balance." };
}
