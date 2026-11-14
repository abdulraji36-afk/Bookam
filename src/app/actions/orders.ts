"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { describeDbError, type ActionState } from "@/lib/action-state";
import { formatMoney, formatQuantity } from "@/lib/format";
import { notify } from "@/lib/notify";
import { MANAGER_ROLES, requireOrg, type OrgContext } from "@/lib/org";
import { firstIssue, orderSchema, readQuantity, tripSchema } from "@/lib/validation";

const idSchema = z.uuid();

/**
 * Each line sends lineKey, productId, quantity and tracked, in step. Each
 * chosen serial-numbered unit is a "unit" field of the form "lineKey|unitId".
 * Blank lines are skipped.
 */
function readLines(formData: FormData) {
  const field = (name: string) => formData.getAll(name).map(String);
  const [lineKeys, productIds, quantities, tracked] = ["lineKey", "productId", "quantity", "tracked"].map(field);
  const units = field("unit").map((value) => value.split("|"));

  return lineKeys
    .map((key, index) => ({
      productId: productIds[index] ?? "",
      tracked: tracked[index] === "1",
      quantity: readQuantity(quantities[index]),
      unitIds: units.filter(([line]) => line === key).map(([, unitId]) => unitId ?? "")
    }))
    .filter((item) => item.productId !== "" || item.quantity !== undefined || item.unitIds.length > 0);
}

/** "Mama Tunde: 40 items, ₦168,000" for an order, read back after saving. */
async function orderLines(context: Pick<OrgContext, "supabase" | "org">, orderId: string, heading: (orderNo: string) => string) {
  const { data } = await context.supabase
    .from("order_summaries")
    .select("order_no, customer_name, total_quantity, total_amount, has_returns")
    .eq("id", orderId)
    .maybeSingle();
  if (!data) return [];
  return [
    heading(data.order_no),
    `${data.customer_name}: ${formatQuantity(Number(data.total_quantity))} items, ${formatMoney(Number(data.total_amount), context.org.currency_code)}`,
    data.has_returns && "Returns are due on this order."
  ];
}

function readOrder(formData: FormData) {
  return orderSchema.safeParse({
    locationId: formData.get("locationId") ?? "",
    orderDate: formData.get("orderDate") ?? "",
    walkIn: formData.get("walkIn") === "on",
    customerId: formData.get("customerId") ?? "",
    buyerName: formData.get("buyerName") ?? "",
    buyerPhone: formData.get("buyerPhone") ?? "",
    handedOver: formData.get("leaving") === "now",
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
  const items = parsed.data.items.map((item) =>
    item.tracked
      ? { product_id: item.productId, unit_ids: item.unitIds }
      : { product_id: item.productId, quantity: item.quantity ?? 0 }
  );
  const customerId = parsed.data.walkIn ? null : parsed.data.customerId;
  const buyerName = parsed.data.walkIn ? parsed.data.buyerName || null : null;
  const buyerPhone = parsed.data.walkIn ? parsed.data.buyerPhone || null : null;

  if (orderId === null) {
    const { data, error } = await supabase.rpc("create_order", {
      p_organization_id: org.id,
      p_location_id: parsed.data.locationId,
      p_order_date: parsed.data.orderDate,
      p_customer_id: customerId,
      p_payment_type: parsed.data.paymentType,
      p_note: parsed.data.note || null,
      p_items: items,
      p_handed_over: parsed.data.handedOver,
      p_buyer_name: buyerName,
      p_buyer_phone: buyerPhone
    });
    const order = data?.[0];
    if (error || !order) return { ok: false, message: describeDbError(error) };

    notify({ supabase, org }, () =>
      orderLines({ supabase, org }, order.id, (no) =>
        parsed.data.handedOver ? `Sold at the counter ${no}` : `New order ${no}`
      )
    );
    revalidatePath(`/b/${slug}`, "layout");
    redirect(`/b/${slug}/orders/${order.id}?saved=1`);
  }

  if (!idSchema.safeParse(orderId).success) return { ok: false, message: "Order not found." };

  const { error } = await supabase.rpc("update_order", {
    p_order_id: orderId,
    p_order_date: parsed.data.orderDate,
    p_customer_id: customerId,
    p_payment_type: parsed.data.paymentType,
    p_note: parsed.data.note || null,
    p_items: items,
    p_buyer_name: buyerName,
    p_buyer_phone: buyerPhone
  });
  if (error) return { ok: false, message: describeDbError(error) };

  notify({ supabase, org }, () => orderLines({ supabase, org }, orderId, (no) => `Order ${no} was changed`));
  revalidatePath(`/b/${slug}`, "layout");
  redirect(`/b/${slug}/orders/${orderId}?saved=1`);
}

export async function cancelOrderAction(
  slug: string,
  orderId: string,
  _previous: ActionState
): Promise<ActionState> {
  const { supabase, org } = await requireOrg(slug);
  if (!idSchema.safeParse(orderId).success) return { ok: false, message: "Order not found." };

  const { error } = await supabase.rpc("cancel_order", { p_order_id: orderId });
  if (error) return { ok: false, message: describeDbError(error) };

  notify({ supabase, org }, () =>
    orderLines({ supabase, org }, orderId, (no) => `Order ${no} cancelled. Its stock was put back.`)
  );

  revalidatePath(`/b/${slug}`, "layout");
  return { ok: true, message: "Order cancelled and stock put back." };
}

export async function handOverOrderAction(
  slug: string,
  orderId: string,
  _previous: ActionState
): Promise<ActionState> {
  const { supabase, org } = await requireOrg(slug);
  if (!idSchema.safeParse(orderId).success) return { ok: false, message: "Order not found." };

  const { error } = await supabase.rpc("hand_over_order", { p_order_id: orderId });
  if (error) return { ok: false, message: describeDbError(error) };

  notify({ supabase, org }, () => orderLines({ supabase, org }, orderId, (no) => `Handed over at the counter ${no}`));
  revalidatePath(`/b/${slug}`, "layout");
  return { ok: true, message: "Order handed over and completed." };
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
  const { supabase, org } = await requireOrg(slug);
  if (!idSchema.safeParse(tripId).success) return { ok: false, message: "Trip not found." };

  const { error } = await supabase.rpc("dispatch_trip", { p_trip_id: tripId });
  if (error) return { ok: false, message: describeDbError(error) };

  notify({ supabase, org }, async () => {
    const { data } = await supabase
      .from("dispatch_trip_summaries")
      .select("trip_no, driver_name, vehicle, order_count, total_quantity, has_returns")
      .eq("id", tripId)
      .maybeSingle();
    if (!data) return [];
    return [
      `Trip ${data.trip_no} dispatched`,
      `Driver ${data.driver_name}${data.vehicle ? ` (${data.vehicle})` : ""}: ${data.order_count} order${data.order_count === 1 ? "" : "s"}, ${formatQuantity(Number(data.total_quantity))} items`,
      data.has_returns && "Returns to collect on this trip."
    ];
  });

  revalidatePath(`/b/${slug}`, "layout");
  return { ok: true, message: "Trip dispatched." };
}

export async function cancelTripAction(
  slug: string,
  tripId: string,
  _previous: ActionState
): Promise<ActionState> {
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);
  if (!idSchema.safeParse(tripId).success) return { ok: false, message: "Trip not found." };

  const { error } = await supabase.rpc("cancel_dispatch_trip", { p_trip_id: tripId });
  if (error) return { ok: false, message: describeDbError(error) };

  notify({ supabase, org }, async () => {
    const { data } = await supabase.from("dispatch_trips").select("trip_no").eq("id", tripId).maybeSingle();
    return data ? [`Trip ${data.trip_no} cancelled before leaving. Its orders are waiting again.`] : [];
  });

  revalidatePath(`/b/${slug}`, "layout");
  return { ok: true, message: "Trip cancelled. Its orders are waiting for dispatch again." };
}
