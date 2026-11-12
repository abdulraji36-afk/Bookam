"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { describeDbError, type ActionState } from "@/lib/action-state";
import { requireUser } from "@/lib/auth/session";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { businessSchema, firstIssue, locationSchema } from "@/lib/validation";

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

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_organization", {
    p_name: parsed.data.name,
    p_business_type: parsed.data.businessType || null
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
