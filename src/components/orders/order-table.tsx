import Link from "next/link";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { DataTable } from "@/components/ui/data-table";
import { formatDay, formatMoney, formatQuantity } from "@/lib/format";
import type { OrderStatus } from "@/types/database";

export type OrderTableRow = {
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
  trip_id?: string | null;
  trip_no?: string | null;
};

/** Orders (or sales) as a table. Money only for owners and admins. */
export function OrderTable({
  rows,
  base,
  currency,
  showMoney,
  delivers,
  empty,
  oneWord
}: {
  rows: OrderTableRow[];
  base: string;
  currency: string;
  showMoney: boolean;
  delivers: boolean;
  empty?: string;
  oneWord: string;
}) {
  return (
    <DataTable
      label={`${oneWord}s`}
      rows={rows}
      rowKey={(row) => row.id}
      rowHref={(row) => `${base}/orders/${row.id}`}
      empty={empty}
      columns={[
        { header: `${oneWord} no.`, cell: (row) => <span className="tabular-nums">{row.order_no}</span> },
        { header: "Status", phone: "badge", cell: (row) => <OrderStatusBadge status={row.status} voided={Boolean(row.voided_at)} delivers={delivers} /> },
        { header: "Date", cell: (row) => formatDay(row.order_date) },
        {
          header: "Customer",
          wrap: true,
          cell: (row) => (
            <span className="font-semibold">
              {row.customer_name}
              {row.customer_area ? <span className="font-medium text-ink-soft"> · {row.customer_area}</span> : null}
            </span>
          )
        },
        {
          header: "Items",
          align: "right",
          cell: (row) => (
            <>
              {formatQuantity(Number(row.total_quantity))}
              {row.has_returns && (row.status === "pending" || row.status === "assigned") ? (
                <span className="block text-xs font-bold text-ink-soft">returns due</span>
              ) : null}
            </>
          )
        },
        ...(showMoney
          ? [{ header: "Value", align: "right" as const, cell: (row: OrderTableRow) => formatMoney(Number(row.total_amount), currency) }]
          : []),
        ...(delivers
          ? [
              {
                header: "Trip",
                cell: (row: OrderTableRow) =>
                  row.trip_id && row.trip_no ? (
                    <Link href={`${base}/dispatch/${row.trip_id}`} className="relative z-10 font-semibold underline decoration-accent decoration-2 underline-offset-4">
                      {row.trip_no}
                    </Link>
                  ) : (
                    <span className="text-ink-soft">—</span>
                  )
              }
            ]
          : [])
      ]}
    />
  );
}
