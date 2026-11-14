import { Badge } from "@/components/ui/card";
import { ORDER_STATUS_LABELS, TRIP_STATUS_LABELS } from "@/lib/format";
import type { OrderStatus, TripStatus } from "@/types/database";

type Tone = "plain" | "solid" | "accent" | "success" | "danger";

// Amber: needs someone to act. Navy: in progress. Green: finished. Grey: called off.
const ORDER_TONES: Record<OrderStatus, Tone> = {
  pending: "accent",
  assigned: "solid",
  dispatched: "solid",
  completed: "success",
  cancelled: "plain"
};

const TRIP_TONES: Record<TripStatus, Tone> = {
  draft: "accent",
  dispatched: "solid",
  completed: "success",
  cancelled: "plain"
};

export function OrderStatusBadge({
  status,
  voided,
  delivers = true
}: {
  status: OrderStatus;
  voided?: boolean;
  /** A business that does not deliver has orders waiting to be collected, not dispatched. */
  delivers?: boolean;
}) {
  if (voided) return <Badge tone="danger">Voided</Badge>;
  const label = status === "pending" && !delivers ? "Waiting to be collected" : ORDER_STATUS_LABELS[status];
  return <Badge tone={ORDER_TONES[status]}>{label}</Badge>;
}

export function TripStatusBadge({ status }: { status: TripStatus }) {
  return <Badge tone={TRIP_TONES[status]}>{TRIP_STATUS_LABELS[status]}</Badge>;
}
