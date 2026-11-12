import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { NavLink } from "@/components/business/nav-link";
import { Logo } from "@/components/logo";
import { LogoutButton } from "@/components/logout-button";
import { PageSkeleton } from "@/components/ui/card";
import { daysUntil } from "@/lib/format";
import { canManage, requireOrg } from "@/lib/org";
import { requestNow } from "@/lib/request-time";

async function BusinessShell({
  params,
  children
}: {
  params: Promise<{ slug: string }>;
  children: ReactNode;
}) {
  const { slug } = await params;
  const { org, role } = await requireOrg(slug);
  const base = `/b/${org.slug}`;
  const trialDays = org.plan_code === "trial" ? daysUntil(org.trial_ends_at, await requestNow()) : null;

  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 pt-3">
          <div className="flex min-w-0 items-center gap-3">
            <Logo href={base} />
            <span className="hidden text-slate-300 sm:inline" aria-hidden>
              /
            </span>
            <Link
              href="/businesses?all=1"
              className="truncate text-sm font-medium text-slate-700 hover:text-slate-900"
              title="Switch business"
            >
              {org.name}
            </Link>
          </div>
          <LogoutButton />
        </div>
        <nav aria-label="Business" className="mx-auto flex w-full max-w-5xl gap-5 overflow-x-auto px-4">
          <NavLink href={base} exact>
            Dashboard
          </NavLink>
          {canManage(role) ? (
            <>
              <NavLink href={`${base}/team`}>Team</NavLink>
              <NavLink href={`${base}/settings`}>Settings</NavLink>
            </>
          ) : null}
        </nav>
      </header>

      {trialDays !== null ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
          {trialDays > 0
            ? `Free trial: ${trialDays} day${trialDays === 1 ? "" : "s"} left.`
            : "Your free trial has ended."}
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">{children}</main>
    </>
  );
}

export default function BusinessLayout({ children, params }: LayoutProps<"/b/[slug]">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-5xl px-4 py-8">
          <PageSkeleton />
        </div>
      }
    >
      <BusinessShell params={params}>{children}</BusinessShell>
    </Suspense>
  );
}
