import Link from "next/link";
import type { ReactNode } from "react";
import { PageTitle } from "@/components/ui/card";

/**
 * Every page starts the same way: the title, one line on what the page is
 * for, and its actions on the right, the main one first.
 */
export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <PageTitle sub={sub}>{title}</PageTitle>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export type Tab = { value: string; label: string; count?: number };

/** Status filters as a row of tabs, e.g. Waiting · On a trip · Completed. */
export function StatusTabs({ tabs, current, hrefFor, label }: { tabs: Tab[]; current: string; hrefFor: (value: string) => string; label: string }) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-1.5">
        {tabs.map((tab) => {
          const active = tab.value === current;
          return (
            <li key={tab.value}>
              <Link
                href={hrefFor(tab.value)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full border-2 px-3.5 text-sm font-bold ${
                  active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink"
                }`}
              >
                {tab.label}
                {tab.count !== undefined ? (
                  <span
                    className={`rounded-full px-1.5 text-xs tabular-nums ${active ? "bg-white/20" : "bg-chip text-ink-soft"}`}
                  >
                    {tab.count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The search box and filters above a table, kept together. */
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}

/** On a record's own page: the things you can do to it, in one place. */
export function ActionsPanel({ children, title = "Actions" }: { children: ReactNode; title?: string }) {
  return (
    <section className="overflow-hidden rounded-md bg-white">
      <h2 className="border-b-[3px] border-ink px-5 py-3 text-lg font-extrabold">{title}</h2>
      <div className="space-y-3 p-5">{children}</div>
    </section>
  );
}
