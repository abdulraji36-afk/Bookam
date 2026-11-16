import { todayIn } from "@/lib/format";
import { dayBounds } from "@/lib/reports/drinks-daily";

type Query = Record<string, string | string[] | undefined>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export type DateRange = {
  from: string;
  to: string;
  today: string;
  /** The range as instants in the business's time zone, for timestamp columns. */
  start: string;
  end: string;
};

/**
 * Reads ?from= and ?to= as in Bilikis's transaction records: the last 30
 * days unless the person picks other dates. Dates after today are pulled
 * back to today, and a reversed range is put the right way round.
 */
export function readDateRange(query: Query, timeZone: string, now: number): DateRange {
  const today = todayIn(timeZone, now);
  const monthAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const pick = (value: string | undefined, fallback: string) =>
    value && DAY.test(value) && !Number.isNaN(Date.parse(value))
      ? value > today
        ? today
        : value
      : fallback;
  let from = pick(first(query.from), monthAgo);
  let to = pick(first(query.to), today);
  if (from > to) [from, to] = [to, from];
  return {
    from,
    to,
    today,
    start: dayBounds(from, timeZone).start,
    end: dayBounds(to, timeZone).end,
  };
}

/** ?customer= when it is a real id. */
export function readCustomer(query: Query) {
  const value = first(query.customer);
  return value && UUID.test(value) ? value : "";
}

/** Bilikis's wording for how an RGB order's empties came back. */
export function emptyResult(row: {
  status: string;
  returnable_quantity: number | null;
  empties_returned: number | null;
}) {
  if (row.empties_returned === null || row.status !== "completed") return "Pending";
  const difference = Number(row.empties_returned) - Number(row.returnable_quantity ?? 0);
  const count = new Intl.NumberFormat("en-NG").format(Math.abs(difference));
  if (difference < 0) return `Short ${count}`;
  if (difference > 0) return `Excess ${count}`;
  return "Balanced";
}

/** The time part of an instant, in the business's time zone. */
export function formatTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-NG", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** The day part of an instant, in the business's time zone (YYYY-MM-DD). */
export function dayOf(iso: string, timeZone: string) {
  return todayIn(timeZone, Date.parse(iso));
}

/** Keeps the filters when moving between pages of a record list. */
export function recordHref(
  path: string,
  filters: Record<string, string | number | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "" && !(key === "page" && value === 1))
      params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}
