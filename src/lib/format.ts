import type { MemberRole, OrderStatus, PaymentType, TripStatus } from "@/types/database";

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

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Waiting for dispatch",
  assigned: "On a trip",
  dispatched: "Out · returns due",
  completed: "Completed",
  cancelled: "Cancelled"
};

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  draft: "Not yet dispatched",
  dispatched: "Out · returns due",
  completed: "Completed",
  cancelled: "Cancelled"
};

export const PAYMENT_LABELS: Record<PaymentType, string> = {
  cash: "Cash",
  transfer: "Bank transfer",
  credit: "On credit"
};

/** Formats a date-only value (YYYY-MM-DD) without shifting it across time zones. */
export function formatDay(isoDay: string) {
  return formatDate(isoDay, "UTC");
}
