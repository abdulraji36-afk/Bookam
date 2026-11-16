import type { ReactNode } from "react";

/** A big number with its label, as on Bilikis's summary cards. */
export function SummaryCard({
  label,
  value,
  strong,
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <div
      data-summary-card
      className={`rounded-md px-5 py-4 ${strong ? "bg-ink text-white" : "bg-white"}`}
    >
      <p
        className={`text-sm font-bold uppercase tracking-wide ${strong ? "text-nav" : "text-ink-soft"}`}
      >
        {label}
      </p>
      <p className="mt-2 text-3xl font-extrabold leading-none tabular-nums sm:text-4xl">
        {value}
      </p>
    </div>
  );
}

/** A row of summary cards: two across on a phone, up to `columns` on a computer. */
export function SummaryCards({
  children,
  columns = 4,
}: {
  children: ReactNode;
  columns?: 3 | 4 | 5 | 6;
}) {
  const wide = {
    3: "md:grid-cols-3",
    4: "xl:grid-cols-4",
    5: "xl:grid-cols-5",
    6: "md:grid-cols-3 xl:grid-cols-6",
  }[columns];
  return <div className={`grid grid-cols-2 gap-3 ${wide}`}>{children}</div>;
}
