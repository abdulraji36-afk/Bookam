import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { requireUser, type CurrentUser } from "@/lib/auth/session";
import { createClient, type ServerClient } from "@/lib/supabase/server";
import { depotWords, sayer, type DepotWords, type Trade } from "@/lib/depot-words";
import type { MemberRole, SellingMode } from "@/types/database";

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
    /** Customers bring things back (crates, cylinders). */
    tracks_returns: boolean;
    /** Sells items tracked one by one by serial number. */
    tracks_serials: boolean;
    /** The main way the business sells; it shapes the words and the menu. */
    selling_mode: SellingMode;
    /** Delivers to customers on trips. When false, Dispatch is hidden. */
    does_delivery: boolean;
    /**
     * Uses the depot workspace (built for drinks): one pool of what comes back,
     * orders that are returnable or not, prices required. trade says whether
     * it speaks of drinks (RGB, PET, Empties) or of goods.
     */
    sells_drinks: boolean;
    trade: Trade;
  };
  /** The depot's words (RGB or Returnable, Empties or its own name), and t() to say a sentence in them. */
  words: DepotWords;
  t: (text: string) => string;
};

const loadOrgContext = cache(async (slug: string): Promise<OrgContext> => {
  const user = await requireUser(`/b/${slug}`);
  const supabase = await createClient();

  // Row level security only returns the business if the user is an active member.
  const { data: org } = await supabase
    .from("organizations")
    // Every column, so a database without the newest one (trade) still loads.
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (!org) notFound();
  const trade: Trade = (org as { trade?: string }).trade === "goods" ? "goods" : "drinks";

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", org.id)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!membership) notFound();

  // A goods depot names what comes back (its one returnable pool).
  let pool: string | null = null;
  if (org.sells_drinks && trade === "goods") {
    const { data: item } = await supabase
      .from("returnable_items")
      .select("name")
      .eq("organization_id", org.id)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    pool = item?.name ?? null;
  }
  const words = depotWords(trade, pool);

  return {
    supabase,
    user,
    org: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      business_type: org.business_type,
      plan_code: org.plan_code,
      trial_ends_at: org.trial_ends_at,
      currency_code: org.currency_code,
      timezone: org.timezone,
      tracks_returns: org.tracks_returns,
      tracks_serials: org.tracks_serials,
      selling_mode: org.selling_mode,
      does_delivery: org.does_delivery,
      sells_drinks: org.sells_drinks,
      trade
    },
    role: membership.role,
    words,
    t: sayer(words)
  };
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
