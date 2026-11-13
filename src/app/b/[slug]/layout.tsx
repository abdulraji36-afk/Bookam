import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { MobileNav } from "@/components/business/mobile-nav";
import type { NavItem } from "@/components/business/nav-items";
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
  const { supabase, org, role } = await requireOrg(slug);
  const base = `/b/${org.slug}`;
  // A business that only sells outright never sees the Returns page.
  const { count: returnableCount } = await supabase
    .from("returnable_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org.id);
  const trialDays = org.plan_code === "trial" ? daysUntil(org.trial_ends_at, await requestNow()) : null;

  const manager = canManage(role);
  const tracksReturns = Boolean(returnableCount);
  const items: NavItem[] = [
    { href: base, label: "Dashboard", icon: "dashboard", exact: true },
    { href: `${base}/orders`, label: "Orders", icon: "orders" },
    { href: `${base}/dispatch`, label: "Dispatch", icon: "dispatch" },
    ...(tracksReturns ? [{ href: `${base}/returns`, label: "Returns", icon: "returns" } as const] : []),
    { href: `${base}/stock`, label: "Stock", icon: "stock" },
    { href: `${base}/products`, label: "Products", icon: "products" },
    { href: `${base}/customers`, label: "Customers", icon: "customers" },
    { href: `${base}/reports/daily`, label: "Reports", icon: "reports" },
    ...(manager
      ? ([
          { href: `${base}/team`, label: "Team", icon: "team" },
          { href: `${base}/activity`, label: "Activity", icon: "activity" },
          { href: `${base}/settings`, label: "Settings", icon: "settings" }
        ] as const)
      : [])
  ];
  // On a phone the first four are tabs; "Dashboard" is shortened to fit.
  const tabs = items.slice(0, 4).map((item) => (item.icon === "dashboard" ? { ...item, label: "Home" } : item));

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      {/* Tablet and up: a side menu that stays in place while the page scrolls. */}
      <aside className="hidden bg-ink text-white md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col">
        <div className="px-5 pb-2 pt-6">
          <Logo href={base} tone="light" />
          <Link
            href="/businesses?all=1"
            title="Switch business"
            className="block truncate text-sm font-medium text-nav hover:text-white"
          >
            {org.name}
          </Link>
        </div>
        <nav aria-label="Business" className="menu-scroll flex-1 space-y-1 overflow-y-auto px-3 py-3">
          {items.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </nav>
        <div className="border-t border-white/10 px-3 py-4">
          <LogoutButton />
        </div>
      </aside>

      {/* Phone: a slim bar that stays at the top; the menu is at the bottom. */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-ink px-4 py-2.5 text-white md:hidden">
        <Logo href={base} tone="light" />
        <span className="min-w-0 truncate text-sm font-semibold text-nav">{org.name}</span>
      </header>

      <div className="flex min-w-0 flex-1 flex-col">
        {trialDays !== null ? (
          <p className="bg-accent px-4 py-2 text-center text-sm font-bold text-accent-ink">
            {trialDays > 0
              ? `Free trial: ${trialDays} day${trialDays === 1 ? "" : "s"} left.`
              : "Your free trial has ended."}
          </p>
        ) : null}
        {/* Extra room at the bottom on phones so the tab bar never covers content. */}
        <main className="w-full max-w-5xl flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">{children}</main>
      </div>

      <MobileNav primary={tabs} more={items.slice(4)} businessName={org.name} />
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
