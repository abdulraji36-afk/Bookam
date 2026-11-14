"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { describeDbError, type ActionState } from "@/lib/action-state";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";
import { customerSchema, firstIssue, productSchema } from "@/lib/validation";

const idSchema = z.uuid();

export async function saveProductAction(
  slug: string,
  productId: string | null,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);

  const parsed = productSchema.safeParse({
    name: formData.get("name") ?? "",
    sku: formData.get("sku") ?? "",
    unit: formData.get("unit") ?? "",
    sellingPrice: formData.get("sellingPrice") ?? "",
    costPrice: formData.get("costPrice") ?? "",
    lowStock: formData.get("lowStock") ?? "",
    requiresReturn: formData.get("requiresReturn") === "on",
    returnItemName: formData.get("returnItemName") ?? "",
    tracksSerials: formData.get("tracksSerials") === "on",
    warrantyMonths: formData.get("warrantyMonths") ?? ""
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  if (productId !== null && !idSchema.safeParse(productId).success) {
    return { ok: false, message: "Product not found." };
  }

  const { error } = await supabase.rpc("save_product", {
    p_organization_id: org.id,
    p_product_id: productId,
    p_name: parsed.data.name,
    p_sku: parsed.data.sku || null,
    p_unit: parsed.data.unit,
    p_selling_price: parsed.data.sellingPrice,
    p_cost_price: parsed.data.costPrice,
    p_low_stock_threshold: parsed.data.lowStock,
    p_requires_return: parsed.data.requiresReturn,
    p_return_item_name: parsed.data.requiresReturn ? parsed.data.returnItemName : null,
    p_tracks_serials: parsed.data.tracksSerials,
    p_warranty_months: parsed.data.tracksSerials ? parsed.data.warrantyMonths : null
  });
  if (error) return { ok: false, message: describeDbError(error) };

  revalidatePath(`/b/${slug}`, "layout");
  redirect(`/b/${slug}/products`);
}

export async function setProductActiveAction(
  slug: string,
  productId: string,
  isActive: boolean,
  _previous: ActionState
): Promise<ActionState> {
  const { supabase } = await requireOrg(slug, MANAGER_ROLES);
  if (!idSchema.safeParse(productId).success) return { ok: false, message: "Product not found." };

  const { error } = await supabase.rpc("set_product_active", {
    p_product_id: productId,
    p_is_active: isActive
  });
  if (error) return { ok: false, message: describeDbError(error) };

  revalidatePath(`/b/${slug}`, "layout");
  return { ok: true, message: isActive ? "Product switched back on." : "Product switched off." };
}

export async function saveCustomerAction(
  slug: string,
  customerId: string | null,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  // Anyone on the team may add a customer; the database limits edits to managers.
  const { supabase, org } = await requireOrg(slug, customerId === null ? undefined : MANAGER_ROLES);

  const parsed = customerSchema.safeParse({
    name: formData.get("name") ?? "",
    phone: formData.get("phone") ?? "",
    area: formData.get("area") ?? "",
    address: formData.get("address") ?? ""
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  if (customerId !== null && !idSchema.safeParse(customerId).success) {
    return { ok: false, message: "Customer not found." };
  }

  const { error } = await supabase.rpc("save_customer", {
    p_organization_id: org.id,
    p_customer_id: customerId,
    p_name: parsed.data.name,
    p_phone: parsed.data.phone || null,
    p_area: parsed.data.area || null,
    p_address: parsed.data.address || null
  });
  if (error) return { ok: false, message: describeDbError(error) };

  revalidatePath(`/b/${slug}`, "layout");
  redirect(`/b/${slug}/customers`);
}

export async function setCustomerActiveAction(
  slug: string,
  customerId: string,
  isActive: boolean,
  _previous: ActionState
): Promise<ActionState> {
  const { supabase } = await requireOrg(slug, MANAGER_ROLES);
  if (!idSchema.safeParse(customerId).success) return { ok: false, message: "Customer not found." };

  const { error } = await supabase.rpc("set_customer_active", {
    p_customer_id: customerId,
    p_is_active: isActive
  });
  if (error) return { ok: false, message: describeDbError(error) };

  revalidatePath(`/b/${slug}`, "layout");
  return { ok: true, message: isActive ? "Customer switched back on." : "Customer switched off." };
}
