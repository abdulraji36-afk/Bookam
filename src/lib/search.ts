type Query = Record<string, string | string[] | undefined>;

export type ListSearch = {
  /** What was typed, cleaned, for showing back in the box. */
  q: string;
  page: number;
  pageSize: number;
  /** Row range for Supabase's .range(from, to). */
  from: number;
  to: number;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Reads ?q= and ?page= from a list page's URL. Characters that mean
 * something to the database filter syntax are dropped, so the text can be
 * put into an ilike pattern safely.
 */
export function readListSearch(query: Query, pageSize: number): ListSearch {
  const q = (first(query.q) ?? "")
    .replace(/[%_,()*\\"':]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  const asked = Number.parseInt(first(query.page) ?? "1", 10);
  const page = Number.isFinite(asked) && asked > 0 ? Math.min(asked, 10_000) : 1;
  const from = (page - 1) * pageSize;
  return { q, page, pageSize, from, to: from + pageSize - 1 };
}

/** A PostgREST .or() filter matching the text anywhere in any of the columns. */
export function matchAny(q: string, columns: string[]) {
  return columns.map((column) => `${column}.ilike.%${q}%`).join(",");
}

/** The link to another page of the same list, keeping the search. */
export function pageHref(base: string, search: Pick<ListSearch, "q">, page: number) {
  const params = new URLSearchParams();
  if (search.q) params.set("q", search.q);
  if (page > 1) params.set("page", String(page));
  const text = params.toString();
  return text ? `${base}?${text}` : base;
}
