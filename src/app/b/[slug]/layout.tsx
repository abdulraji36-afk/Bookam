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
    <div className="flex flex-1 flex-col md:flex-row">
      {/* A top bar on phones, a side menu from tablet width up. */}
      <aside className="bg-ink text-white md:flex md:w-60 md:shrink-0 md:flex-col">
        <div className="flex items-center justify-between gap-3 px-4 pt-4 md:px-5 md:pt-6">
          <div className="min-w-0">
            <Logo href={base} tone="light" />
            <Link
              href="/businesses?all=1"
              title="Switch business"
              className="block truncate text-sm font-medium text-nav hover:text-white"
            >
              {org.name}
            </Link>
          </div>
          <div className="md:hidden">
            <LogoutButton />
          </div>
        </div>

        <nav aria-label="Business" className="flex gap-1.5 overflow-x-auto px-3 py-3 md:flex-col md:py-5">
          <NavLink href={base} exact>
            Dashboard
          </NavLink>
          <NavLink href={`${base}/orders`}>Orders</NavLink>
          <NavLink href={`${base}/dispatch`}>Dispatch</NavLink>
          <NavLink href={`${base}/stock`}>Stock</NavLink>
          <NavLink href={`${base}/products`}>Products</NavLink>
          <NavLink href={`${base}/customers`}>Customers</NavLink>
          {canManage(role) ? (
            <>
              <NavLink href={`${base}/team`}>Team</NavLink>
              <NavLink href={`${base}/settings`}>Settings</NavLink>
            </>
          ) : null}
        </nav>

        <div className="mt-auto hidden px-3 pb-5 md:block">
          <LogoutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {trialDays !== null ? (
          <p className="bg-accent px-4 py-2 text-center text-sm font-bold text-accent-ink">
            {trialDays > 0
              ? `Free trial: ${trialDays} day${trialDays === 1 ? "" : "s"} left.`
              : "Your free trial has ended."}
          </p>
        ) : null}
        <main className="w-full max-w-5xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
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
