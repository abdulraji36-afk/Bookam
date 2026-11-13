"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { isActivePath, NAV_ICONS, type NavItem } from "@/components/business/nav-items";

/** A small pulsing dot while the page behind a tapped link is loading. */
function Pending({ className }: { className: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`size-2 rounded-full bg-current ${pending ? "animate-pending" : "opacity-0"} ${className}`}
    />
  );
}

/** A row in the desktop side menu. */
export function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const isActive = isActivePath(pathname, item);
  const Icon = NAV_ICONS[item.icon];

  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={`flex min-h-12 items-center gap-3 rounded-md px-3.5 ${
        isActive
          ? "bg-accent font-extrabold text-accent-ink"
          : "font-semibold text-nav hover:bg-white/10 hover:text-white"
      }`}
    >
      <Icon aria-hidden className="size-5 shrink-0" strokeWidth={isActive ? 2.5 : 2} />
      <span className="flex-1">{item.label}</span>
      <Pending className="shrink-0" />
    </Link>
  );
}

/** A tab in the phone's bottom bar: icon over a short label. */
export function TabLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = isActivePath(pathname, item);
  const Icon = NAV_ICONS[item.icon];

  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      onClick={onNavigate}
      className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-md px-1 text-[0.6875rem] leading-none ${
        isActive ? "font-extrabold text-accent" : "font-semibold text-nav"
      }`}
    >
      <Icon aria-hidden className="size-6" strokeWidth={isActive ? 2.5 : 2} />
      {item.label}
      <Pending className="absolute right-3 top-1.5" />
    </Link>
  );
}
