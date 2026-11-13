import { Badge } from "@/components/ui/card";
import { ORDER_STATUS_LABELS, TRIP_STATUS_LABELS } from "@/lib/format";
import type { OrderStatus, TripStatus } from "@/types/database";

const ORDER_TONES: Record<OrderStatus, "plain" | "solid" | "accent"> = {
  pending: "accent",
  assigned: "solid",
  dispatched: "solid",
  completed: "plain",
  cancelled: "plain"
};

const TRIP_TONES: Record<TripStatus, "plain" | "solid" | "accent"> = {
  draft: "accent",
  dispatched: "solid",
  completed: "plain",
  cancelled: "plain"
};

export function OrderStatusBadge({ status, voided }: { status: OrderStatus; voided?: boolean }) {
  if (voided) return <Badge tone="accent">Voided</Badge>;
  return <Badge tone={ORDER_TONES[status]}>{ORDER_STATUS_LABELS[status]}</Badge>;
}

export function TripStatusBadge({ status }: { status: TripStatus }) {
  return <Badge tone={TRIP_TONES[status]}>{TRIP_STATUS_LABELS[status]}</Badge>;
}
