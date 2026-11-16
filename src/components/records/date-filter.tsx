import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const INPUT =
  "mt-1.5 block min-h-12 w-full rounded-md border-2 border-field bg-white px-3 text-base font-medium focus:border-ink focus:outline-2 focus:outline-accent";

/**
 * Bilikis's record filter: a date range, and optionally a customer. A plain
 * GET form, so it works before any JavaScript has loaded.
 */
export function RecordFilter({
  action,
  from,
  to,
  today,
  customers,
  customer,
}: {
  action: string;
  from: string;
  to: string;
  today: string;
  customers?: { id: string; name: string }[];
  customer?: string;
}) {
  return (
    <Card>
      <form
        method="get"
        action={action}
        className={`grid gap-4 md:items-end ${
          customers
            ? "md:grid-cols-[1fr_1fr_1.4fr_auto]"
            : "md:grid-cols-[1fr_1fr_auto]"
        }`}
      >
        <label className="block text-sm font-bold">
          From
          <input className={INPUT} type="date" name="from" defaultValue={from} max={today} />
        </label>
        <label className="block text-sm font-bold">
          To
          <input className={INPUT} type="date" name="to" defaultValue={to} max={today} />
        </label>
        {customers ? (
          <label className="block text-sm font-bold">
            Customer
            <select className={INPUT} name="customer" defaultValue={customer ?? ""}>
              <option value="">All customers</option>
              {customers.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="flex gap-2">
          <button type="submit" className={buttonClass("primary")}>
            Apply
          </button>
          <Link href={action} className={buttonClass("ghost")}>
            Reset
          </Link>
        </div>
      </form>
    </Card>
  );
}
