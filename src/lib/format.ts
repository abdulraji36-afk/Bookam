import type { MemberRole } from "@/types/database";

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  staff: "Staff"
};

export function daysUntil(isoDate: string | null, now: number) {
  if (!isoDate) return null;
  return Math.max(0, Math.ceil((new Date(isoDate).getTime() - now) / 86_400_000));
}

export function formatDate(isoDate: string, timeZone = "Africa/Lagos") {
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeZone }).format(
    new Date(isoDate)
  );
}

export function formatMoney(amount: number | null, currency = "NGN") {
  if (amount === null) return "Not set";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2
  }).format(amount);
}

export function formatQuantity(quantity: number) {
  return new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 }).format(quantity);
}

/** Today's date (YYYY-MM-DD) in the business's time zone. */
export function todayIn(timeZone: string, now: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, dateStyle: "short" }).format(new Date(now));
}
