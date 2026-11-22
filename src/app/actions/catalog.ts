"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { describeDbError, type ActionState } from "@/lib/action-state";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";
import { DRINK_CATEGORIES } from "@/lib/format";
import { NBC_PRODUCTS } from "@/lib/nbc-products";
import { customerSchema, firstIssue, productSchema, readQuantity, safeText } from "@/lib/validation";

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
  // Drinks: RGB or PET is always chosen, and a PET drink always has a category.
  const drinkKind = String(formData.get("drinkKind") ?? "");
  const typed = String(formData.get("category") ?? "").replace(/\s+/g, " ").trim().slice(0, 30);
  if (org.sells_drinks && drinkKind !== "rgb" && drinkKind !== "pet") {
    return { ok: false, message: "Choose whether this drink is RGB or PET." };
  }
  if (org.sells_drinks && drinkKind === "pet" && !typed) {
    return { ok: false, message: "Choose a category for this drink, or type your own." };
  }
  // A drink's own category (Beer, Malt...) is fine; RGB is only for crates that come back.
  if (org.sells_drinks && drinkKind === "pet" && typed.toUpperCase() === "RGB") {
    return { ok: false, message: "RGB is for drinks whose crates come back. Choose RGB above, or another category." };
  }
  if (!safeText().safeParse(typed).success) {
    return { ok: false, message: "Remove the hidden formatting characters from the category." };
  }
  // "pet" or "juice" is filed with the usual PET or Juice, and a category the
  // business already uses keeps its spelling, so lists do not split in two.
  let category = typed;
  if (org.sells_drinks && typed) {
    const { data: used } = await supabase
      .from("products")
      .select("category")
      .eq("organization_id", org.id)
      .not("category", "is", null)
      .limit(1000);
    const known = [...DRINK_CATEGORIES, ...(used ?? []).map((row) => row.category as string)];
    category = known.find((name) => name.toLowerCase() === typed.toLowerCase()) ?? typed;
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
    p_warranty_months: parsed.data.tracksSerials ? parsed.data.warrantyMonths : null,
    // Drinks only: RGB, PET, Juice and so on. The database sets RGB itself.
    p_category: category || null
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

/**
 * Drinks only: adds the ticked products from the NBC list, each with the
 * selling price and buying cost entered beside it. Products that fail are
 * reported by name; the others are still added.
 */
export async function addNbcProductsAction(slug: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);
  if (!org.sells_drinks) return { ok: false, message: "The NBC list is for drinks businesses." };

  const picked = NBC_PRODUCTS.filter((product) => formData.get(`pick-${product.code}`) === "on");
  if (picked.length === 0) return { ok: false, message: "Tick at least one product to add." };

  const { data: pool } = await supabase
    .from("returnable_items")
    .select("name")
    .eq("organization_id", org.id)
    .order("created_at")
    .limit(1);
  const emptiesName = pool?.[0]?.name ?? "Empties";

  const missing = picked.filter((product) => {
    const price = readQuantity(String(formData.get(`price-${product.code}`) ?? ""));
    const cost = readQuantity(String(formData.get(`cost-${product.code}`) ?? ""));
    return !price || !cost;
  });
  if (missing.length) {
    return {
      ok: false,
      message: `Enter the selling price and buying cost for: ${missing.map((product) => product.name).join(", ")}.`
    };
  }

  const failed: string[] = [];
  for (const product of picked) {
    const { error } = await supabase.rpc("save_product", {
      p_organization_id: org.id,
      p_product_id: null,
      p_name: product.name,
      p_sku: product.code,
      p_unit: product.unit,
      p_selling_price: readQuantity(String(formData.get(`price-${product.code}`))) ?? null,
      p_cost_price: readQuantity(String(formData.get(`cost-${product.code}`))) ?? null,
      p_low_stock_threshold: null,
      p_requires_return: product.category === "RGB",
      p_return_item_name: product.category === "RGB" ? emptiesName : null,
      p_category: product.category
    });
    if (error) failed.push(`${product.name}: ${describeDbError(error)}`);
  }

  revalidatePath(`/b/${slug}`, "layout");
  if (failed.length) {
    return {
      ok: false,
      message: `${picked.length - failed.length} added. Not added: ${failed.join(" ")}`
    };
  }
  redirect(`/b/${slug}/products?added=${picked.length}`);
}

/** Bilikis's saved product display order. */
export async function saveProductOrderAction(
  slug: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);
  const ids = String(formData.get("ids") ?? "")
    .split(",")
    .filter(Boolean);
  if (ids.length === 0 || ids.some((id) => !z.uuid().safeParse(id).success)) {
    return { ok: false, message: "The product list changed. Refresh the page and try again." };
  }
  const { error } = await supabase.rpc("save_product_order", {
    p_organization_id: org.id,
    p_product_ids: ids
  });
  if (error) return { ok: false, message: describeDbError(error) };
  revalidatePath(`/b/${slug}`, "layout");
  return { ok: true, message: "Product order saved. The order screen and reports now follow it." };
}
