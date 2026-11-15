import { Search, X } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { pageHref, type ListSearch } from "@/lib/search";

/** A plain GET search box. It works before any JavaScript has loaded. */
export function SearchForm({ action, q, label, placeholder }: { action: string; q: string; label: string; placeholder: string }) {
  return (
    <form method="get" action={action} role="search" className="flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1 text-sm font-bold">
        <span className="sr-only">{label}</span>
        <span className="relative block">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-soft" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            autoComplete="off"
            placeholder={placeholder}
            className="block min-h-12 w-full rounded-md border-2 border-field bg-white pl-10 pr-3 text-base font-medium placeholder:font-normal placeholder:text-ink-soft/70 focus:border-ink focus:outline-2 focus:outline-accent"
          />
        </span>
      </label>
      <button type="submit" className={buttonClass("secondary")}>
        Search
      </button>
      {q ? (
        <Link href={action} className={buttonClass("ghost")}>
          <X aria-hidden className="size-4" /> Clear
        </Link>
      ) : null}
    </form>
  );
}

/** "Showing 51–100 of 230" with Previous and Next links. Hidden when everything fits on one page. */
export function Pager({
  base,
  search,
  total,
  hrefFor
}: {
  base: string;
  search: ListSearch;
  total: number;
  /** Builds a page's link when the list has more filters than the search. */
  hrefFor?: (page: number) => string;
}) {
  const link = (page: number) => (hrefFor ? hrefFor(page) : pageHref(base, search, page));
  if (total <= search.pageSize && search.page === 1) return null;
  const last = Math.max(1, Math.ceil(total / search.pageSize));
  const start = total === 0 ? 0 : search.from + 1;
  const end = Math.min(total, search.to + 1);

  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm font-bold text-ink-soft tabular-nums">
        Showing {start}–{end} of {total}
      </p>
      <div className="flex gap-2">
        {search.page > 1 ? (
          <Link href={link(Math.min(search.page - 1, last))} rel="prev" className={buttonClass("secondary", "sm")}>
            ← Previous
          </Link>
        ) : null}
        {search.page < last ? (
          <Link href={link(search.page + 1)} rel="next" className={buttonClass("secondary", "sm")}>
            Next →
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

/** Shown in place of a list when a search finds nothing. */
export function NoMatches({ q, base }: { q: string; base: string }) {
  return (
    <p className="rounded-md bg-white px-5 py-4 font-medium text-ink-soft">
      Nothing matches “{q}”.{" "}
      <Link href={base} className="font-extrabold text-ink underline decoration-accent decoration-4 underline-offset-4">
        Show everything
      </Link>
    </p>
  );
}
