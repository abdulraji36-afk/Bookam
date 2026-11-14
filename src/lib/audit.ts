import type { Json } from "@/types/database";

/** Plain-language names for the actions recorded in the audit log. */
const ACTION_LABELS: Record<string, string> = {
  create_organization: "Created the business",
  update_organization: "Changed the business details",
  create_location: "Added a location",
  invite_member: "Invited a team member",
  revoke_invitation: "Cancelled an invitation",
  accept_invitation: "Joined the team",
  set_member_role: "Changed a team member's role",
  deactivate_member: "Removed a team member's access",
  reactivate_member: "Restored a team member's access",
  create_product: "Added a product",
  update_product: "Changed a product",
  deactivate_product: "Switched a product off",
  reactivate_product: "Switched a product on",
  create_customer: "Added a customer",
  update_customer: "Changed a customer",
  deactivate_customer: "Switched a customer off",
  reactivate_customer: "Switched a customer on",
  record_stock_receipt: "Received stock",
  create_order: "Recorded an order",
  update_order: "Changed an order",
  cancel_order: "Cancelled an order",
  hand_over_order: "Handed over at the counter",
  create_dispatch_trip: "Created a trip",
  dispatch_trip: "Dispatched a trip",
  cancel_dispatch_trip: "Cancelled a trip",
  record_trip_returns: "Recorded a trip's returns",
  record_supplier_exchange: "Recorded a supplier exchange",
  record_returnable_adjustment: "Added or subtracted returnables",
  record_customer_opening_debt: "Recorded a customer's old debt",
  void_order: "Voided an order",
  void_stock_receipt: "Voided a stock receipt",
  void_supplier_exchange: "Voided a supplier exchange",
  void_returnable_adjustment: "Voided an adjustment",
  correct_trip_return: "Corrected a returned figure",
  connect_telegram: "Connected Telegram",
  disconnect_telegram: "Disconnected Telegram",
  enable_notifications: "Resumed notifications",
  disable_notifications: "Paused notifications"
};

export function describeAction(action: string) {
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

/** Actions that undo or override earlier work, shown with emphasis. */
export function isCorrection(action: string) {
  return action.startsWith("void_") || action.startsWith("correct_") || action.startsWith("cancel_");
}

const DETAIL_KEYS: [key: string, label: string][] = [
  ["order_no", ""],
  ["trip_no", ""],
  ["receipt_no", ""],
  ["exchange_no", ""],
  ["name", ""],
  ["email", ""],
  ["returnable", ""],
  ["quantity_delta", "change"],
  ["quantity_taken", "taken"],
  ["quantity", "quantity"],
  ["returned", "returned"],
  ["role", "role"],
  ["reason", "reason"]
];

/** Adjustment reasons are stored as short codes; show them in plain words. */
const REASON_WORDS: Record<string, string> = {
  customer_return: "a customer brought them back",
  purchase: "bought new ones",
  opening_count: "opening count",
  correction: "the count was wrong",
  damaged_or_lost: "damaged or lost",
  given_to_customer: "given back to a customer"
};

/** A one-line summary of the useful facts stored with an audit entry. */
export function describeDetails(values: Json | null) {
  if (!values || typeof values !== "object" || Array.isArray(values)) return "";
  const record = values as Record<string, Json | undefined>;

  return DETAIL_KEYS.flatMap(([key, label]) => {
    const value = record[key];
    if (typeof value !== "string" && typeof value !== "number") return [];
    const shown = key === "reason" ? (REASON_WORDS[String(value)] ?? value) : value;
    return [label ? `${label}: ${shown}` : String(shown)];
  }).join(" · ");
}
