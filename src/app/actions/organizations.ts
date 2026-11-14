"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { describeDbError, type ActionState } from "@/lib/action-state";
import { requireUser } from "@/lib/auth/session";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { businessSchema, firstIssue, locationSchema } from "@/lib/validation";
import type { SellingMode } from "@/types/database";

/** The answers to "How do you sell?" and its follow-ups, or null if not chosen. */
function readSelling(formData: FormData) {
  const value = formData.get("sellingMode");
  if (value !== "quantity" && value !== "serial") return null;
  const mode: SellingMode = value;
  return {
    p_selling_mode: mode,
    // A drinks business always tracks its empties; the database makes sure too.
    p_sells_drinks: mode === "quantity" ? formData.get("sellsDrinks") === "on" : undefined,
    p_tracks_returns: formData.get("tracksReturns") === "on" || (mode === "quantity" && formData.get("sellsDrinks") === "on"),
    // A serial shop always has serial numbers on; the database makes sure too.
    p_tracks_serials: mode === "serial" || formData.get("tracksSerials") === "on",
    p_does_delivery: formData.get("doesDelivery") === "on"
  };
}

export async function createBusinessAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireUser("/onboarding");

  const parsed = businessSchema.safeParse({
    name: formData.get("name"),
    businessType: formData.get("businessType") ?? undefined
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  if (!readSelling(formData)) return { ok: false, message: "Choose how you sell." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_organization", {
    p_name: parsed.data.name,
    p_business_type: parsed.data.businessType || null,
    ...readSelling(formData)!
  });

  const created = data?.[0];
  if (error || !created) return { ok: false, message: describeDbError(error) };

  redirect(`/b/${created.slug}`);
}

export async function updateBusinessAction(
  slug: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);

  const parsed = businessSchema.safeParse({
    name: formData.get("name"),
    businessType: formData.get("businessType") ?? undefined
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  const { error } = await supabase.rpc("update_organization", {
    p_organization_id: org.id,
    p_name: parsed.data.name,
    p_business_type: parsed.data.businessType || null
  });
  if (error) return { ok: false, message: describeDbError(error) };

  revalidatePath(`/b/${slug}`, "layout");
  return { ok: true, message: "Business details saved." };
}

export async function createLocationAction(
  slug: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);

  const parsed = locationSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  const { error } = await supabase.rpc("create_location", {
    p_organization_id: org.id,
    p_name: parsed.data.name
  });
  if (error) return { ok: false, message: describeDbError(error) };

  revalidatePath(`/b/${slug}`, "layout");
  return { ok: true, message: `${parsed.data.name} added.` };
}

export async function setBusinessFeaturesAction(
  slug: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);

  const selling = readSelling(formData);
  if (!selling) return { ok: false, message: "Choose how you sell." };

  const { error } = await supabase.rpc("set_business_features", {
    p_organization_id: org.id,
    ...selling
  });
  if (error) return { ok: false, message: describeDbError(error) };

  revalidatePath(`/b/${slug}`, "layout");
  return { ok: true, message: "Saved. The menus and forms now match what you sell." };
}
