"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { describeDbError, type ActionState } from "@/lib/action-state";
import { requireUser } from "@/lib/auth/session";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { firstIssue, inviteSchema } from "@/lib/validation";

const idSchema = z.uuid();

export type InviteResult = { link: string; email: string };

export async function inviteMemberAction(
  slug: string,
  _previous: ActionState<InviteResult>,
  formData: FormData
): Promise<ActionState<InviteResult>> {
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role")
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  const { data, error } = await supabase.rpc("invite_member", {
    p_organization_id: org.id,
    p_email: parsed.data.email,
    p_role: parsed.data.role
  });

  const invitation = data?.[0];
  if (error || !invitation) return { ok: false, message: describeDbError(error) };

  revalidatePath(`/b/${slug}/team`);
  return {
    ok: true,
    message: `Invitation ready for ${parsed.data.email}.`,
    data: { link: `${await getSiteUrl()}/invite/${invitation.token}`, email: parsed.data.email }
  };
}

export async function revokeInvitationAction(
  slug: string,
  invitationId: string,
  _previous: ActionState
): Promise<ActionState> {
  const { supabase } = await requireOrg(slug, MANAGER_ROLES);
  if (!idSchema.safeParse(invitationId).success) return { ok: false, message: "Invitation not found." };

  const { error } = await supabase.rpc("revoke_invitation", { p_invitation_id: invitationId });
  if (error) return { ok: false, message: describeDbError(error) };

  revalidatePath(`/b/${slug}/team`);
  return { ok: true, message: "Invitation cancelled." };
}

export async function setMemberRoleAction(
  slug: string,
  membershipId: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase } = await requireOrg(slug, ["owner"]);
  const role = z.enum(["admin", "staff"]).safeParse(formData.get("role"));
  if (!idSchema.safeParse(membershipId).success || !role.success) {
    return { ok: false, message: "Choose Admin or Staff." };
  }

  const { error } = await supabase.rpc("set_member_role", {
    p_membership_id: membershipId,
    p_role: role.data
  });
  if (error) return { ok: false, message: describeDbError(error) };

  revalidatePath(`/b/${slug}/team`);
  return { ok: true, message: "Role updated." };
}

export async function setMemberActiveAction(
  slug: string,
  membershipId: string,
  isActive: boolean,
  _previous: ActionState
): Promise<ActionState> {
  const { supabase } = await requireOrg(slug, MANAGER_ROLES);
  if (!idSchema.safeParse(membershipId).success) return { ok: false, message: "Team member not found." };

  const { error } = await supabase.rpc("set_member_active", {
    p_membership_id: membershipId,
    p_is_active: isActive
  });
  if (error) return { ok: false, message: describeDbError(error) };

  revalidatePath(`/b/${slug}/team`);
  return { ok: true, message: isActive ? "Access restored." : "Access removed." };
}

export async function acceptInvitationAction(
  token: string,
  _previous: ActionState
): Promise<ActionState> {
  await requireUser(`/invite/${token}`);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });

  const joined = data?.[0];
  if (error || !joined) return { ok: false, message: describeDbError(error) };

  redirect(`/b/${joined.slug}`);
}
