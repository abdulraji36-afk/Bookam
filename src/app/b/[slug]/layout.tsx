import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { MobileNav } from "@/components/business/mobile-nav";
import type { NavGroup, NavItem } from "@/components/business/nav-items";
import { NavLink } from "@/components/business/nav-link";
import { Logo } from "@/components/logo";
import { LogoutButton } from "@/components/logout-button";
import { PageSkeleton } from "@/components/ui/card";
import { daysUntil } from "@/lib/format";
import { canManage, requireOrg } from "@/lib/org";
import { requestNow } from "@/lib/request-time";
import { saleWords } from "@/lib/selling";

async function BusinessShell({
  params,
  children,
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
  const trialDays =
    org.plan_code === "trial"
      ? daysUntil(org.trial_ends_at, await requestNow())
      : null;

  const manager = canManage(role);
  // Shown when the business tracks returns, or still has returnables on record.
  const tracksReturns = org.tracks_returns || Boolean(returnableCount);
  const words = saleWords(org.selling_mode);

  // Daily work first, then what you set up, then reports, then admin.
  const groups: NavGroup[] = [
    {
      label: null,
      items: [
        { href: base, label: "Dashboard", icon: "dashboard", exact: true },
      ],
    },
    {
      label: "Daily work",
      items: [
        { href: `${base}/orders`, label: words.Many, icon: "orders" },
        ...(org.does_delivery
          ? [
              {
                href: `${base}/dispatch`,
                label: "Dispatch",
                icon: "dispatch",
                excludes: [`${base}/dispatch/crew`],
              } as const,
            ]
          : []),
        {
          href: `${base}/stock`,
          label: "Stock",
          icon: "deliveries",
          excludes: [`${base}/stock/summary`],
        },
        {
          href: `${base}/stock/summary`,
          label: "Stock summary",
          icon: "stock",
        },
        ...(tracksReturns
          ? [
              {
                href: `${base}/returns`,
                label: org.sells_drinks ? "Empties" : "Returns",
                icon: "returns",
                excludes: [
                  `${base}/returns/shortages`,
                  `${base}/returns/exchanges`,
                  `${base}/returns/exchange`,
                ],
              } as const,
            ]
          : []),
        ...(org.sells_drinks
          ? [
              {
                href: `${base}/returns/shortages`,
                label: "Empty shortages",
                icon: "shortages",
              } as const,
            ]
          : []),
        ...(org.sells_drinks
          ? [
              {
                href: `${base}/returns/exchanges`,
                label: "Empty exchanges",
                icon: "exchanges",
              } as const,
            ]
          : []),
      ],
    },
    {
      label: "Catalogue",
      items: [
        { href: `${base}/products`, label: "Products", icon: "products" },
        { href: `${base}/customers`, label: "Customers", icon: "customers" },
        ...(org.does_delivery
          ? [
              {
                href: `${base}/dispatch/crew`,
                label: "Drivers & workers",
                icon: "drivers",
              } as const,
            ]
          : []),
      ],
    },
    {
      label: "Reports",
      items: [
        {
          href: `${base}/reports/daily`,
          label: "Daily report",
          icon: "reports",
        },
        ...(manager
          ? ([
              {
                href: `${base}/reports/stock-value`,
                label: "Stock value",
                icon: "value",
              },
              { href: `${base}/activity`, label: "Activity", icon: "activity" },
            ] as const)
          : []),
      ],
    },
    ...(manager
      ? [
          {
            label: "Admin",
            items: [
              { href: `${base}/team`, label: "Team", icon: "team" },
              { href: `${base}/settings`, label: "Settings", icon: "settings" },
            ] as NavItem[],
          },
        ]
      : []),
  ];
  const all = groups.flatMap((group) => group.items);
  // On a phone the busiest pages are tabs; the rest sit under "More".
  const tabHrefs = [
    base,
    `${base}/orders`,
    `${base}/stock`,
    tracksReturns
      ? `${base}/returns`
      : org.does_delivery
        ? `${base}/dispatch`
        : `${base}/customers`,
  ];
  const tabs = tabHrefs
    .map((href) => all.find((item) => item.href === href))
    .filter((item): item is NavItem => Boolean(item))
    .map((item) =>
      item.icon === "dashboard" ? { ...item, label: "Home" } : item,
    );
  const moreGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !tabHrefs.includes(item.href)),
    }))
    .filter((group) => group.items.length > 0);
  const quick = [
    { href: `${base}/orders/new`, label: `+ New ${words.one}` },
    { href: `${base}/stock/receive`, label: "Receive stock" },
  ];

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
        <div className="grid grid-cols-1 gap-2 px-3 pb-1 pt-3">
          {quick.map((action, index) => (
            <Link
              key={action.href}
              href={action.href}
              className={`flex min-h-10 items-center justify-center rounded-md px-3 text-sm font-extrabold uppercase tracking-wide ${
                index === 0
                  ? "bg-accent text-accent-ink hover:bg-accent-strong"
                  : "border-2 border-white/30 text-white hover:bg-white/10"
              }`}
            >
              {action.label}
            </Link>
          ))}
        </div>
        <nav
          aria-label="Business"
          className="menu-scroll flex-1 overflow-y-auto px-3 py-3"
        >
          {groups.map((group) => (
            <div key={group.label ?? "home"} className="mb-2">
              {group.label ? (
                <p className="px-3.5 pb-0.5 pt-1.5 text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-nav/70">
                  {group.label}
                </p>
              ) : null}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink key={item.href} item={item} />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 px-3 py-4">
          <LogoutButton />
        </div>
      </aside>

      {/* Phone: a slim bar that stays at the top; the menu is at the bottom. */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-ink px-4 py-2.5 text-white md:hidden">
        <Logo href={base} tone="light" />
        <span className="min-w-0 truncate text-sm font-semibold text-nav">
          {org.name}
        </span>
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
        <main className="w-full max-w-5xl flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">
          {children}
        </main>
      </div>

      <MobileNav
        primary={tabs}
        more={moreGroups}
        quick={quick}
        businessName={org.name}
      />
    </div>
  );
}

export default function BusinessLayout({
  children,
  params,
}: LayoutProps<"/b/[slug]">) {
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
