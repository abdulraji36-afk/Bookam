import type {
  MemberRole,
  OrderStatus,
  PaymentType,
  ReturnableAdjustmentReason,
  ReturnableMovementType,
  TripStatus,
  UnitCondition,
  UnitStatus
} from "@/types/database";

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

export const MOVEMENT_LABELS: Record<ReturnableMovementType, string> = {
  dispatch: "Sent out with an order",
  trip_return: "Came back with a trip",
  supplier_exchange: "Taken by the supplier",
  adjustment: "Adjustment",
  opening_debt: "Old debt recorded"
};

export const ADD_REASONS: [ReturnableAdjustmentReason, string][] = [
  ["customer_return", "A customer brought them back"],
  ["purchase", "Bought new ones"],
  ["opening_count", "Opening count (already in store)"],
  ["correction", "The count was wrong"]
];

export const SUBTRACT_REASONS: [ReturnableAdjustmentReason, string][] = [
  ["damaged_or_lost", "Damaged or lost"],
  ["given_to_customer", "Given back to a customer"],
  ["correction", "The count was wrong"]
];

/** "12 owed" / "5 in credit" for a customer's returnable balance. */
export function describeOwed(owed: number) {
  return owed >= 0 ? `${formatQuantity(owed)} owed` : `${formatQuantity(-owed)} in credit`;
}

export const CONDITION_LABELS: Record<UnitCondition, string> = {
  brand_new: "Brand new",
  uk_used: "UK used",
  nigerian_used: "Nigerian used"
};

export const UNIT_STATUS_LABELS: Record<UnitStatus, string> = {
  in_stock: "In stock",
  reserved: "On an order",
  sold: "Sold"
};

/** "356789… · Black · UK used" for one unit. */
export function describeUnit(unit: { serial_no: string; colour: string | null; condition: UnitCondition }) {
  return [unit.serial_no, unit.colour, CONDITION_LABELS[unit.condition]].filter(Boolean).join(" · ");
}
