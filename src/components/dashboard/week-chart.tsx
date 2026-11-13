import { formatQuantity } from "@/lib/format";

export type DayCount = { day: string; weekday: string; dateLabel: string; count: number; isToday: boolean };

/**
 * Orders recorded on each of the last seven days, as thin columns.
 *
 * Only today and the busiest day carry a number; every day's figure is in
 * its hover/focus tooltip and in a table for screen readers.
 */
export function WeekChart({ days }: { days: DayCount[] }) {
  const max = Math.max(1, ...days.map((day) => day.count));
  const peak = days.reduce((best, day) => (day.count > best.count ? day : best), days[0]);

  return (
    <figure className="m-0">
      <div aria-hidden className="flex h-40 items-end gap-1 border-b-2 border-line sm:gap-3">
        {days.map((day) => {
          const labelled = day.count > 0 && (day.isToday || day.day === peak.day);
          return (
            <div
              key={day.day}
              tabIndex={0}
              className="group relative flex h-full flex-1 cursor-default flex-col items-center justify-end rounded-t outline-none focus-visible:bg-paper"
            >
              <span className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-ink px-2 py-1 text-xs font-medium text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
                <strong className="font-extrabold">{formatQuantity(day.count)}</strong> order{day.count === 1 ? "" : "s"} ·{" "}
                {day.dateLabel}
              </span>
              {labelled ? (
                <span className="mb-1 text-sm font-extrabold tabular-nums text-ink">{formatQuantity(day.count)}</span>
              ) : null}
              {day.count > 0 ? (
                <span
                  className="w-full max-w-6 rounded-t bg-chart transition-opacity duration-150 group-hover:opacity-80"
                  style={{ height: `${Math.max(3, (day.count / max) * 78)}%` }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      <div aria-hidden className="mt-2 flex gap-1 sm:gap-3">
        {days.map((day) => (
          <span
            key={day.day}
            className={`flex-1 text-center text-xs ${day.isToday ? "font-extrabold text-ink" : "font-medium text-ink-soft"}`}
          >
            {day.isToday ? "Today" : day.weekday}
          </span>
        ))}
      </div>

      <table className="sr-only">
        <caption>Orders recorded on each of the last seven days</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Orders</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.day}>
              <th scope="row">{day.dateLabel}</th>
              <td>{day.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
