import Link from "next/link";
import type { ReactNode } from "react";

export type Column<T> = {
  header: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  /**
   * How the cell shows on a phone, where each row becomes a card: the card's
   * title, a badge beside the title, a labelled line (the default), or hidden.
   */
  phone?: "title" | "badge" | "detail" | "hide";
  /** Let long text such as names wrap; numbers, dates and codes stay on one line. */
  wrap?: boolean;
  className?: string;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Makes the whole row open this page; the first column carries the link. */
  rowHref?: (row: T) => string | null;
  /** Shown instead of the table when there are no rows. */
  empty?: ReactNode;
  /** Extra rows at the bottom, such as totals. */
  footer?: ReactNode;
  /** Accessible name for the table. */
  label?: string;
};

/**
 * The table every list uses. On a tablet or computer it is a plain table;
 * on a phone each row becomes a small card (see .data-table in globals.css),
 * so nothing has to scroll sideways.
 */
export function DataTable<T>({ columns, rows, rowKey, rowHref, empty, footer, label }: Props<T>) {
  if (rows.length === 0 && empty) {
    return <div className="px-5 py-5 font-medium text-ink-soft">{empty}</div>;
  }

  return (
    <div className="md:overflow-x-auto">
    <table className="data-table w-full" aria-label={label}>
      <thead>
        <tr className="border-b border-line">
          {columns.map((column) => (
            <th
              key={column.header}
              scope="col"
              className={`whitespace-nowrap px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide text-ink-soft first:pl-5 last:pr-5 ${
                column.align === "right" ? "text-right" : "text-left"
              }`}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((row) => {
          const href = rowHref?.(row);
          return (
            <tr key={rowKey(row)} className={href ? "relative hover:bg-paper" : undefined}>
              {columns.map((column, index) => (
                <td
                  key={column.header}
                  data-label={column.header}
                  data-phone={column.phone ?? (index === 0 ? "title" : "detail")}
                  className={`px-4 py-3 align-middle first:pl-5 last:pr-5 ${column.wrap ? "" : "whitespace-nowrap"} ${
                    column.align === "right" ? "text-right tabular-nums" : ""
                  } ${column.className ?? ""}`}
                >
                  {index === 0 && href ? (
                    <Link
                      href={href}
                      className="font-extrabold after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-[-2px] focus-visible:after:outline-ink"
                    >
                      {column.cell(row)}
                    </Link>
                  ) : (
                    column.cell(row)
                  )}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
      {footer ? <tfoot className="border-t-2 border-ink">{footer}</tfoot> : null}
    </table>
    </div>
  );
}

/** A card holding a table, with a heavy title bar like the other cards. */
export function TableCard({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-md bg-white">
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-[3px] border-ink px-5 py-3">
          <h2 className="text-lg font-extrabold">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
