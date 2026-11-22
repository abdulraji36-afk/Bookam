import type { DrinksDaily } from "@/lib/reports/drinks-daily";

const number = (value: number) => new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 }).format(value);
const signed = (value: number) => (value > 0 ? `+${number(value)}` : value < 0 ? `-${number(-value)}` : "0");
const CATEGORY_ORDER = ["RGB", "PET", "ENERGY", "JUICE", "CAN"];

/**
 * Bilikis's end-of-day Telegram message ("DAILY OPERATIONS"): what happened,
 * empties in and out, the closing position by category and the empty
 * balance, work still open, and corrections and voids. Quantities only.
 */
export function formatDailyOperations({
  businessName,
  day,
  timeZone,
  data,
  outstandingCases,
  outstandingEmpties,
  corrections,
}: {
  businessName: string;
  day: string;
  timeZone: string;
  data: DrinksDaily;
  outstandingCases: number;
  outstandingEmpties: number;
  corrections: number;
}) {
  const t = data.totals;
  const title = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`)
  );
  const byCategory = (pick: (row: DrinksDaily["products"][number]) => number) => {
    const totals = new Map<string, { quantity: number; unit: string }>();
    for (const row of data.products) {
      const key = row.category.toUpperCase();
      const current = totals.get(key) ?? { quantity: 0, unit: row.unit };
      current.quantity += pick(row);
      totals.set(key, current);
    }
    return [...totals.entries()].sort(([a], [b]) => {
      const x = CATEGORY_ORDER.indexOf(a);
      const y = CATEGORY_ORDER.indexOf(b);
      return (x === -1 ? 99 : x) - (y === -1 ? 99 : y) || a.localeCompare(b);
    });
  };
  const plural = (unit: string, quantity: number) => (quantity === 1 || unit.endsWith("s") ? unit : `${unit}s`);
  const counted = (value: number, word: string) => `${number(value)} ${plural(word, value)}`;

  const activity: string[] = [];
  if (t.stockRecords > 0) {
    activity.push(`Stock received: ${counted(t.stockRecords, "record")} / ${number(t.stockUnits)} units`);
    for (const [category, { quantity, unit }] of byCategory((row) => row.received)) {
      if (quantity > 0) activity.push(`- ${category}: ${number(quantity)} ${plural(unit, quantity)}`);
    }
  }
  if (t.petSales > 0) activity.push(`PET sales recorded: ${counted(t.petSales, "sale")} / ${number(t.petPacks)} packs`);
  if (t.rgbSales > 0) activity.push(`RGB sales recorded: ${counted(t.rgbSales, "sale")} / ${number(t.rgbCrates)} crates`);
  if (t.petTrips > 0) activity.push(`PET dispatched: ${counted(t.petTrips, "trip")} / ${number(t.petOut)} packs`);
  if (t.rgbTrips > 0) activity.push(`RGB dispatched: ${counted(t.rgbTrips, "trip")} / ${number(t.rgbOut)} crates`);

  const empties: string[] = [];
  if (t.tripReturns > 0) empties.push(`Trip returns: +${number(t.tripReturns)}`);
  if (t.followups > 0) empties.push(`Shortage follow-ups: +${number(t.followups)}`);
  if (t.givenToSupplier > 0) empties.push(`Given to supplier: -${number(t.givenToSupplier)}`);
  if (t.adjustmentRecords > 0) empties.push(`Adjustments: ${counted(t.adjustmentRecords, "record")} / ${signed(t.adjustmentTotal)}`);

  const closing = byCategory((row) => row.closing).map(
    ([category, { quantity, unit }]) => `- ${category}: ${number(quantity)} ${plural(unit, quantity)}`
  );
  if (data.emptiesAtClose !== null) closing.push(`- EMPTY BALANCE: ${number(data.emptiesAtClose)}`);

  const open = [
    ["PET sales waiting", data.openWork.petWaiting],
    ["RGB sales waiting", data.openWork.rgbWaiting],
    ["Draft trips", data.openWork.draftTrips],
    ["RGB trips waiting for returns", data.openWork.waitingReturns],
    ["Outstanding shortage cases", outstandingCases],
    ["Outstanding empties", outstandingEmpties],
  ]
    .filter(([, value]) => Number(value) > 0)
    .map(([label, value]) => `${label}: ${number(Number(value))}`);

  const admin = [
    corrections > 0 ? `Corrections: ${number(corrections)}` : null,
    t.voidedSales > 0 ? `Voided sales: ${number(t.voidedSales)}` : null,
  ].filter((line): line is string => Boolean(line));

  const zone = timeZone.split("/").pop()?.replace(/_/g, " ") ?? timeZone;
  const sections = [
    `${businessName}`,
    `DAILY OPERATIONS - ${title}`,
    ["ACTIVITY", ...(activity.length ? activity : ["No stock, sale, or dispatch activity recorded."])].join("\n"),
    ["EMPTY MOVEMENT", ...(empties.length ? empties : ["No empty movement recorded."])].join("\n"),
    ["CLOSING POSITION", ...closing].join("\n"),
    ["OPEN WORK", ...(open.length ? open : ["No unfinished work."])].join("\n"),
    admin.length ? ["ADMIN ACTIVITY", ...admin].join("\n") : null,
    `Closed at 11:59 pm ${zone} time.`,
  ].filter((section): section is string => Boolean(section));

  const text = sections.join("\n\n");
  return text.length > 3900 ? `${text.slice(0, 3850).replace(/\n[^\n]*$/, "")}\n\nMore details are in the daily report.` : text;
}
