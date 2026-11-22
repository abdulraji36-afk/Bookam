import type { ReactNode } from "react";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { DataTable, TableCard } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { SummaryCard } from "@/components/ui/summary-card";
import { formatDay, formatMoney, formatQuantity } from "@/lib/format";
import type { DrinksDaily } from "@/lib/reports/drinks-daily";

const INPUT =
  "mt-1.5 block min-h-12 w-full rounded-md border-2 border-field bg-white px-3 text-base font-medium focus:border-ink focus:outline-2 focus:outline-accent";

/** One report section: a titled table, or a short note when the day had nothing. */
function Section({
  title,
  description,
  columns,
  rows,
  empty,
}: {
  title: string;
  description?: string;
  columns: { header: string; align?: "right" }[];
  rows: ReactNode[][];
  empty: string;
}) {
  return (
    <TableCard title={title}>
      {description ? (
        <p className="px-5 pt-3 text-sm text-ink-soft">{description}</p>
      ) : null}
      {rows.length === 0 ? (
        <p className="px-5 py-4 text-sm font-medium text-ink-soft">
          <span className="font-bold text-ink">{empty}.</span> No records for
          this business day.
        </p>
      ) : (
        <DataTable
          label={title}
          rows={rows.map((cells, index) => ({ cells, index }))}
          rowKey={(row) => String(row.index)}
          columns={columns.map((column, position) => ({
            header: column.header,
            align: column.align,
            wrap: position > 0,
            phone: position === 0 ? ("title" as const) : undefined,
            cell: (row: { cells: ReactNode[] }) =>
              position === 0 ? (
                <span className="whitespace-nowrap font-bold">
                  {row.cells[position]}
                </span>
              ) : (
                row.cells[position]
              ),
          }))}
        />
      )}
    </TableCard>
  );
}

const n = (value: number) => formatQuantity(value);
const signed = (value: number) =>
  value > 0 ? `+${n(value)}` : value < 0 ? `−${n(-value)}` : "0";

/**
 * The Bilikis Daily Operations report, for a drinks depot. Owners and admins
 * also see values, costs, details and exceptions; staff see quantities only.
 */
export function DrinksDailyReport({
  base,
  day,
  today,
  manager,
  currency,
  data,
  error,
  t,
}: {
  t: (text: string) => string;
  base: string;
  day: string;
  today: string;
  manager: boolean;
  currency: string;
  data: DrinksDaily | null;
  error: string | null;
}) {
  const date = formatDay(day);
  const money = (value: number | null) =>
    value === null ? "—" : formatMoney(value, currency);
  const openTotal = data
    ? data.openWork.petWaiting +
      data.openWork.rgbWaiting +
      data.openWork.draftTrips +
      data.openWork.waitingReturns +
      data.openWork.shortageFollowUps
    : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Daily report"
        sub={
          manager
            ? "Review the day’s stock, sales, dispatch, return and depot activity."
            : "Stock, sales, dispatches and empty returns for the day."
        }
      />

      <Card>
        <CardHeader
          title="Daily view"
          description="Choose the business day to review."
        />
        <form
          method="get"
          action={`${base}/reports/daily`}
          className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end"
        >
          <label className="block text-sm font-bold">
            Report date
            <input
              className={INPUT}
              type="date"
              name="date"
              defaultValue={day}
              max={today}
            />
          </label>
          <button type="submit" className={buttonClass("primary")}>
            Apply
          </button>
        </form>
      </Card>

      {error || !data ? (
        <EmptyState title="Daily operations could not load">
          {error ?? "Please try again."}
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <SummaryCard label={t("PET closing stock")} value={n(data.petClosing)} />
            <SummaryCard label={t("RGB closing stock")} value={n(data.rgbClosing)} />
            <SummaryCard
              label={t("Empty balance at close")}
              value={
                data.emptiesAtClose === null
                  ? "Unavailable"
                  : n(data.emptiesAtClose)
              }
            />
            <SummaryCard
              label="Open work at close"
              value={n(openTotal)}
              strong
            />
          </div>

          <Section
            title={`Daily activity on ${date}`}
            description="A record remains on the date it happened. Later dispatches, returns and reversals appear on their own action dates."
            columns={[
              { header: "Activity" },
              { header: "Records", align: "right" },
              { header: "Quantity" },
              ...(manager ? [{ header: "Details" }] : []),
            ]}
            rows={data.activity.map((row) => [
              t(row.activity),
              n(row.records),
              t(row.quantity),
              ...(manager ? [t(row.detail)] : []),
            ])}
            empty="No daily activity"
          />

          <Section
            title={`Stock received on ${date}`}
            columns={[
              { header: "Stock-in no." },
              { header: "Time" },
              { header: "Supplier / Ref" },
              { header: "Products" },
              { header: "Quantity", align: "right" },
              ...(manager
                ? [{ header: "Total cost", align: "right" as const }]
                : []),
            ]}
            rows={data.stockReceived.map((row) => [
              row.reference,
              row.time,
              row.party,
              row.products,
              n(row.quantity),
              ...(manager ? [money(row.cost)] : []),
            ])}
            empty="No stock received"
          />

          {(
            [
              ["PET", data.petSales],
              ["RGB", data.rgbSales],
            ] as const
          ).map(([kind, rows]) => (
            <Section
              key={kind}
              title={t(`${kind} sales recorded on ${date}`)}
              columns={[
                { header: "Sales no." },
                { header: "Time" },
                { header: "Customer" },
                { header: "Products" },
                { header: "Quantity", align: "right" },
                ...(manager
                  ? [{ header: "Value", align: "right" as const }]
                  : []),
                { header: "Status" },
              ]}
              rows={rows.map((row) => [
                row.reference,
                row.time,
                row.party,
                row.products,
                n(row.quantity),
                ...(manager ? [money(row.value)] : []),
                t(row.status),
              ])}
              empty={`No ${kind} sales recorded`}
            />
          ))}

          <Section
            title={`Dispatches made on ${date}`}
            columns={[
              { header: "Channel" },
              { header: "Time" },
              { header: "Trip no." },
              { header: "Driver" },
              { header: "Customers" },
              { header: "Quantity", align: "right" },
              { header: "Status" },
            ]}
            rows={data.dispatches.map((row) => [
              t(row.channel),
              row.time,
              row.reference,
              row.driver,
              row.customers,
              n(row.quantity),
              t(row.status),
            ])}
            empty="No dispatches made"
          />

          <Section
            title={t(`Empty movements on ${date}`)}
            columns={[
              { header: "Activity" },
              { header: "Time" },
              { header: "Reference" },
              { header: "Customer / Source" },
              { header: "Quantity", align: "right" },
              ...(manager ? [{ header: "Note" }] : []),
            ]}
            rows={data.emptyMovements.map((row) => [
              t(row.activity),
              row.time,
              t(row.reference),
              row.party,
              signed(row.quantity),
              ...(manager ? [t(row.note || "—")] : []),
            ])}
            empty="No empty movements"
          />

          {manager ? (
            <Section
              title={`Exceptions on ${date}`}
              columns={[
                { header: "Event" },
                { header: "Time" },
                { header: "Reference" },
                { header: "Reason" },
                { header: "Stock impact" },
              ]}
              rows={data.exceptions.map((row) => [
                t(row.event),
                row.time,
                row.reference,
                row.reason,
                t(row.impact),
              ])}
              empty="No exceptions"
            />
          ) : null}

          <TableCard title={`Work still open at close of ${date}`}>
            <p className="px-5 pt-3 text-sm text-ink-soft">
              This separates unresolved work from the activity that was actually
              posted during the day.
            </p>
            <div className="grid grid-cols-2 gap-3 p-5 xl:grid-cols-5">
              <SummaryCard
                label={t("PET waiting dispatch")}
                value={n(data.openWork.petWaiting)}
              />
              <SummaryCard
                label={t("RGB waiting dispatch")}
                value={n(data.openWork.rgbWaiting)}
              />
              <SummaryCard
                label="Draft trips"
                value={n(data.openWork.draftTrips)}
              />
              <SummaryCard
                label="Waiting returns"
                value={n(data.openWork.waitingReturns)}
              />
              <SummaryCard
                label="Shortage follow-ups"
                value={n(data.openWork.shortageFollowUps)}
              />
            </div>
          </TableCard>

          <Section
            title={`Product movement on ${date}`}
            columns={[
              { header: "Product code" },
              { header: "Product name" },
              { header: "Category" },
              { header: "Unit" },
              { header: "Opening", align: "right" },
              { header: "Stock in", align: "right" },
              { header: "Stock out", align: "right" },
              { header: "Closing", align: "right" },
            ]}
            rows={data.products.map((row) => [
              row.code,
              row.name,
              t(row.category),
              row.unit,
              n(row.opening),
              n(row.received),
              n(row.issued),
              n(row.closing),
            ])}
            empty="No products found"
          />
        </>
      )}
    </div>
  );
}
