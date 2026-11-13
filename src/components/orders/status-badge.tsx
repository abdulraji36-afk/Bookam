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

export function OrderStatusBadge({ status, voided }: { status: OrderStatus; voided?: boolean }) {
  if (voided) return <Badge tone="danger">Voided</Badge>;
  return <Badge tone={ORDER_TONES[status]}>{ORDER_STATUS_LABELS[status]}</Badge>;
}

export function TripStatusBadge({ status }: { status: TripStatus }) {
  return <Badge tone={TRIP_TONES[status]}>{TRIP_STATUS_LABELS[status]}</Badge>;
}
