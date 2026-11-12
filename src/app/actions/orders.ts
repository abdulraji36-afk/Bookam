"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { describeDbError, type ActionState } from "@/lib/action-state";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";
import { firstIssue, orderSchema, tripSchema } from "@/lib/validation";

const idSchema = z.uuid();

/** Lines arrive as parallel productId / quantity fields; blank lines are skipped. */
function readLines(formData: FormData) {
  const productIds = formData.getAll("productId").map(String);
  const quantities = formData.getAll("quantity").map(String);
  return productIds
    .map((productId, index) => ({ productId, quantity: quantities[index] ?? "" }))
    .filter((item) => item.productId !== "" || item.quantity.trim() !== "");
}

function readOrder(formData: FormData) {
  return orderSchema.safeParse({
    locationId: formData.get("locationId") ?? "",
    orderDate: formData.get("orderDate") ?? "",
    customerId: formData.get("customerId") ?? "",
    paymentType: formData.get("paymentType") ?? "",
    note: formData.get("note") ?? "",
    items: readLines(formData)
  });
}

export async function saveOrderAction(
  slug: string,
  orderId: string | null,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, org } = await requireOrg(slug);

  const parsed = readOrder(formData);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const items = parsed.data.items.map((item) => ({ product_id: item.productId, quantity: item.quantity }));

  if (orderId === null) {
    const { data, error } = await supabase.rpc("create_order", {
      p_organization_id: org.id,
      p_location_id: parsed.data.locationId,
      p_order_date: parsed.data.orderDate,
      p_customer_id: parsed.data.customerId,
      p_payment_type: parsed.data.paymentType,
      p_note: parsed.data.note || null,
      p_items: items
    });
    const order = data?.[0];
    if (error || !order) return { ok: false, message: describeDbError(error) };

    revalidatePath(`/b/${slug}`, "layout");
    redirect(`/b/${slug}/orders/${order.id}?saved=1`);
  }

  if (!idSchema.safeParse(orderId).success) return { ok: false, message: "Order not found." };

  const { error } = await supabase.rpc("update_order", {
    p_order_id: orderId,
    p_order_date: parsed.data.orderDate,
    p_customer_id: parsed.data.customerId,
    p_payment_type: parsed.data.paymentType,
    p_note: parsed.data.note || null,
    p_items: items
  });
  if (error) return { ok: false, message: describeDbError(error) };

  revalidatePath(`/b/${slug}`, "layout");
  redirect(`/b/${slug}/orders/${orderId}?saved=1`);
}

export async function cancelOrderAction(
  slug: string,
  orderId: string,
  _previous: ActionState
): Promise<ActionState> {
  const { supabase } = await requireOrg(slug);
  if (!idSchema.safeParse(orderId).success) return { ok: false, message: "Order not found." };

  const { error } = await supabase.rpc("cancel_order", { p_order_id: orderId });
  if (error) return { ok: false, message: describeDbError(error) };

  revalidatePath(`/b/${slug}`, "layout");
  return { ok: true, message: "Order cancelled and stock put back." };
}

export async function createTripAction(
  slug: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, org } = await requireOrg(slug);

  const parsed = tripSchema.safeParse({
    locationId: formData.get("locationId") ?? "",
    dispatchDate: formData.get("dispatchDate") ?? "",
    driverName: formData.get("driverName") ?? "",
    vehicle: formData.get("vehicle") ?? "",
    note: formData.get("note") ?? "",
    orderIds: formData.getAll("orderId").map(String)
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  const { data, error } = await supabase.rpc("create_dispatch_trip", {
    p_organization_id: org.id,
    p_location_id: parsed.data.locationId,
    p_dispatch_date: parsed.data.dispatchDate,
    p_driver_name: parsed.data.driverName,
    p_vehicle: parsed.data.vehicle || null,
    p_note: parsed.data.note || null,
    p_order_ids: parsed.data.orderIds
  });
  const trip = data?.[0];
  if (error || !trip) return { ok: false, message: describeDbError(error) };

  revalidatePath(`/b/${slug}`, "layout");
  redirect(`/b/${slug}/dispatch/${trip.id}`);
}

export async function dispatchTripAction(
  slug: string,
  tripId: string,
  _previous: ActionState
): Promise<ActionState> {
  const { supabase } = await requireOrg(slug);
  if (!idSchema.safeParse(tripId).success) return { ok: false, message: "Trip not found." };

  const { error } = await supabase.rpc("dispatch_trip", { p_trip_id: tripId });
  if (error) return { ok: false, message: describeDbError(error) };

  revalidatePath(`/b/${slug}`, "layout");
  return { ok: true, message: "Trip dispatched." };
}

export async function cancelTripAction(
  slug: string,
  tripId: string,
  _previous: ActionState
): Promise<ActionState> {
  const { supabase } = await requireOrg(slug, MANAGER_ROLES);
  if (!idSchema.safeParse(tripId).success) return { ok: false, message: "Trip not found." };

  const { error } = await supabase.rpc("cancel_dispatch_trip", { p_trip_id: tripId });
  if (error) return { ok: false, message: describeDbError(error) };

  revalidatePath(`/b/${slug}`, "layout");
  return { ok: true, message: "Trip cancelled. Its orders are waiting for dispatch again." };
}
