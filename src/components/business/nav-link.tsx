"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, exact, children }: { href: string; exact?: boolean; children: string }) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`flex min-h-12 shrink-0 items-center whitespace-nowrap rounded-md px-3.5 ${
        isActive
          ? "bg-accent font-extrabold text-accent-ink"
          : "font-semibold text-nav hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}
