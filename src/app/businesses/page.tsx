import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AccountBar } from "@/components/account-bar";
import { buttonClass } from "@/components/ui/button";
import { Badge, PageSkeleton } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your businesses" };

async function BusinessList({ searchParams }: Pick<PageProps<"/businesses">, "searchParams">) {
  const [user, params] = await Promise.all([requireUser("/businesses"), searchParams]);
  const supabase = await createClient();

  const { data: memberships } = await supabase
    .from("memberships")
    .select("role, organizations (name, slug, business_type)")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at");

  const businesses = (memberships ?? []).flatMap((membership) =>
    membership.organizations ? [{ role: membership.role, ...membership.organizations }] : []
  );

  if (businesses.length === 0) redirect("/onboarding");
  // "?all=1" lets someone with one business still reach this page to add another.
  if (businesses.length === 1 && params.all !== "1") redirect(`/b/${businesses[0].slug}`);

  return (
    <ul className="space-y-3">
      {businesses.map((business) => (
        <li key={business.slug}>
          <Link
            href={`/b/${business.slug}`}
            className="flex items-center justify-between gap-3 rounded-md border-2 border-transparent bg-white p-4 hover:border-ink"
          >
            <span>
              <span className="block text-lg font-extrabold text-ink">{business.name}</span>
              {business.business_type ? (
                <span className="text-sm text-ink-soft">{business.business_type}</span>
              ) : null}
            </span>
            <Badge tone={business.role === "owner" ? "solid" : "plain"}>{ROLE_LABELS[business.role]}</Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function BusinessesPage({ searchParams }: PageProps<"/businesses">) {
  return (
    <>
      <AccountBar />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h1 className="text-3xl font-extrabold uppercase tracking-tight">Your businesses</h1>
          <Link href="/onboarding" className={buttonClass("secondary", "sm")}>
            Add a business
          </Link>
        </div>
        <Suspense fallback={<PageSkeleton />}>
          <BusinessList searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}
