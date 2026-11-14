"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { describeDbError, type ActionState } from "@/lib/action-state";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";

const workerSchema = z.object({
  name: z.string().trim().min(2, "Enter the name.").max(80, "Use at most 80 characters for the name."),
  role: z.enum(["driver", "loader"], "Choose driver or loader."),
  phone: z.string().trim().max(30, "That phone number is too long.")
});

/** Owners and admins add a driver or loader to the list. */
export async function saveWorkerAction(slug: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);
  const parsed = workerSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    role: String(formData.get("role") ?? ""),
    phone: String(formData.get("phone") ?? "")
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the details." };

  const { error } = await supabase.rpc("save_dispatch_worker", {
    p_organization_id: org.id,
    p_worker_id: null,
    p_name: parsed.data.name,
    p_role: parsed.data.role,
    p_phone: parsed.data.phone || null
  });
  if (error) return { ok: false, message: describeDbError(error) };

  revalidatePath(`/b/${slug}`, "layout");
  return { ok: true, message: `${parsed.data.name} added.` };
}

export async function setWorkerActiveAction(
  slug: string,
  workerId: string,
  isActive: boolean,
  _previous: ActionState
): Promise<ActionState> {
  const { supabase } = await requireOrg(slug, MANAGER_ROLES);
  if (!z.uuid().safeParse(workerId).success) return { ok: false, message: "Not found." };

  const { error } = await supabase.rpc("set_dispatch_worker_active", { p_worker_id: workerId, p_is_active: isActive });
  if (error) return { ok: false, message: describeDbError(error) };

  revalidatePath(`/b/${slug}`, "layout");
  return { ok: true, message: isActive ? "Switched back on." : "Switched off." };
}
