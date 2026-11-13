import Link from "next/link";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { formatDay, formatMoney, formatQuantity } from "@/lib/format";
import type { OrderStatus } from "@/types/database";

export type OrderRowData = {
  id: string;
  order_no: string;
  order_date: string;
  status: OrderStatus;
  customer_name: string;
  customer_area: string | null;
  total_quantity: number;
  total_amount: number;
  has_returns: boolean;
  voided_at: string | null;
};

export function OrderRow({ order, base, currency }: { order: OrderRowData; base: string; currency: string }) {
  return (
    <li>
      <Link
        href={`${base}/orders/${order.id}`}
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4 hover:bg-paper"
      >
        <span className="min-w-0">
          <span className="block text-lg font-extrabold">
            {order.customer_name}
            {order.customer_area ? ` (${order.customer_area})` : ""}
          </span>
          <span className="font-medium text-ink-soft">
            {order.order_no} · {formatDay(order.order_date)} · {formatQuantity(Number(order.total_quantity))} items ·{" "}
            {formatMoney(Number(order.total_amount), currency)}
            {order.has_returns && (order.status === "pending" || order.status === "assigned")
              ? " · returns due"
              : ""}
          </span>
        </span>
        <OrderStatusBadge status={order.status} voided={Boolean(order.voided_at)} />
      </Link>
    </li>
  );
}
