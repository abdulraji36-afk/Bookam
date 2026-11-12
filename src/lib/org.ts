import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { requireUser, type CurrentUser } from "@/lib/auth/session";
import { createClient, type ServerClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/types/database";

export type OrgContext = {
  supabase: ServerClient;
  user: CurrentUser;
  role: MemberRole;
  org: {
    id: string;
    name: string;
    slug: string;
    business_type: string | null;
    plan_code: string;
    trial_ends_at: string | null;
    currency_code: string;
    timezone: string;
  };
};

const loadOrgContext = cache(async (slug: string): Promise<OrgContext> => {
  const user = await requireUser(`/b/${slug}`);
  const supabase = await createClient();

  // Row level security only returns the business if the user is an active member.
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, business_type, plan_code, trial_ends_at, currency_code, timezone")
    .eq("slug", slug)
    .maybeSingle();

  if (!org) notFound();

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", org.id)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!membership) notFound();

  return { supabase, user, org, role: membership.role };
});

/**
 * Loads the business for a /b/[slug] route and confirms the signed-in user
 * belongs to it. Pass roles to restrict a page to owners and admins.
 */
export async function requireOrg(slug: string, roles?: MemberRole[]): Promise<OrgContext> {
  const context = await loadOrgContext(slug);
  if (roles && !roles.includes(context.role)) redirect(`/b/${context.org.slug}`);
  return context;
}

export const MANAGER_ROLES: MemberRole[] = ["owner", "admin"];

export function canManage(role: MemberRole) {
  return MANAGER_ROLES.includes(role);
}
