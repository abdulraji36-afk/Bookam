"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { safeText, phoneText } from "@/lib/validation";
import { describeDbError, type ActionState } from "@/lib/action-state";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";

const workerSchema = z.object({
  name: safeText().min(2, "Enter the name.").max(80, "Use at most 80 characters for the name."),
  role: z.enum(["driver", "loader"], "Choose driver or worker."),
  phone: phoneText()
});

/** Owners and admins add a driver or worker to the list, or change one (workerId set). */
export async function saveWorkerAction(
  slug: string,
  workerId: string | null,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  if (workerId !== null && !z.uuid().safeParse(workerId).success) return { ok: false, message: "Not found." };
  const { supabase, org, t } = await requireOrg(slug, MANAGER_ROLES);
  const parsed = workerSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    role: String(formData.get("role") ?? ""),
    phone: String(formData.get("phone") ?? "")
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the details." };

  const { error } = await supabase.rpc("save_dispatch_worker", {
    p_organization_id: org.id,
    p_worker_id: workerId,
    p_name: parsed.data.name,
    p_role: parsed.data.role,
    p_phone: parsed.data.phone || null
  });
  if (error) return { ok: false, message: t(describeDbError(error)) };

  revalidatePath(`/b/${slug}`, "layout");
  return { ok: true, message: workerId ? "Saved." : `${parsed.data.name} added.` };
}

export async function setWorkerActiveAction(
  slug: string,
  workerId: string,
  isActive: boolean,
  _previous: ActionState
): Promise<ActionState> {
  const { supabase, t } = await requireOrg(slug, MANAGER_ROLES);
  if (!z.uuid().safeParse(workerId).success) return { ok: false, message: "Not found." };

  const { error } = await supabase.rpc("set_dispatch_worker_active", { p_worker_id: workerId, p_is_active: isActive });
  if (error) return { ok: false, message: t(describeDbError(error)) };

  revalidatePath(`/b/${slug}`, "layout");
  return { ok: true, message: isActive ? "Switched back on." : "Switched off." };
}
