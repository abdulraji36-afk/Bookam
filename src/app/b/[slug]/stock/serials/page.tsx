import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { Badge, EmptyState, ListCard, PageSkeleton, PageTitle } from "@/components/ui/card";
import { CONDITION_LABELS, formatDate, formatDay, UNIT_STATUS_LABELS } from "@/lib/format";
import { requireOrg } from "@/lib/org";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Find a serial number" };

const LINK = "font-extrabold underline decoration-accent decoration-2 underline-offset-4";

/** Same clean-up the database applies when a serial is stored. */
function normalise(value: string) {
  return value.replace(/\s/g, "").toUpperCase().replace(/[^A-Z0-9\-/.]/g, "").slice(0, 40);
}

function addMonths(iso: string, months: number) {
  const date = new Date(iso);
  date.setMonth(date.getMonth() + months);
  return date;
}

async function Serials({ params, searchParams }: PageProps<"/b/[slug]/stock/serials">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { supabase, org } = await requireOrg(slug);
  const base = `/b/${org.slug}`;
  const asked = typeof query.q === "string" ? query.q : "";
  const q = normalise(asked);
  const now = await requestNow();

  const { data } =
    q.length >= 3
      ? await supabase
          .from("product_units")
          .select(
            "id, serial_no, colour, condition, status, sold_at, created_at, products (name, warranty_months), locations (name), stock_receipts (id, receipt_no, received_date, supplier_name), orders (id, order_no, order_date, buyer_name, buyer_phone, customers (name, phone))"
          )
          .eq("organization_id", org.id)
          .ilike("serial_no", `%${q}%`)
          .order("created_at", { ascending: false })
          .limit(20)
      : { data: [] };
  const units = data ?? [];

  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle sub="Where a unit came from, who bought it, and whether it is under warranty.">
        Find a serial number
      </PageTitle>

      <form method="get" className="flex flex-wrap items-end gap-2" role="search">
        <label className="min-w-0 flex-1 text-sm font-bold">
          Serial number or IMEI
          <input
            type="search"
            name="q"
            defaultValue={asked}
            autoComplete="off"
            autoFocus
            placeholder="Type or scan at least 3 characters"
            className="mt-1.5 block min-h-12 w-full rounded-md border-2 border-field bg-white px-3 text-base font-medium placeholder:font-normal placeholder:text-ink-soft/70 focus:border-ink focus:outline-2 focus:outline-accent"
          />
        </label>
        <button type="submit" className={buttonClass("primary")}>
          Find
        </button>
      </form>

      {asked && q.length < 3 ? <p className="font-medium text-ink-soft">Type at least 3 characters.</p> : null}
      {q.length >= 3 && units.length === 0 ? (
        <EmptyState title="Not found">No unit with a serial number containing &ldquo;{q}&rdquo;.</EmptyState>
      ) : null}

      {units.map((unit) => {
        const order = unit.orders;
        const buyer = order ? (order.customers?.name ?? order.buyer_name ?? "Walk-in buyer") : null;
        const phone = order ? (order.customers?.phone ?? order.buyer_phone) : null;
        const months = unit.products?.warranty_months ?? null;
        const warrantyEnds = unit.status === "sold" && unit.sold_at && months ? addMonths(unit.sold_at, months) : null;

        return (
          <ListCard
            key={unit.id}
            title={unit.serial_no}
            action={
              <Badge tone={unit.status === "in_stock" ? "success" : unit.status === "reserved" ? "accent" : "solid"}>
                {UNIT_STATUS_LABELS[unit.status]}
              </Badge>
            }
          >
            <dl className="grid gap-4 p-5 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-bold uppercase tracking-wide text-ink-soft">Product</dt>
                <dd className="font-semibold">
                  {unit.products?.name}
                  <span className="block text-sm font-medium text-ink-soft">
                    {[unit.colour, CONDITION_LABELS[unit.condition]].filter(Boolean).join(" · ")}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-bold uppercase tracking-wide text-ink-soft">Came in</dt>
                <dd className="font-semibold">
                  {unit.stock_receipts ? (
                    <Link href={`${base}/stock/receipts/${unit.stock_receipts.id}`} className={LINK}>
                      {unit.stock_receipts.receipt_no}
                    </Link>
                  ) : null}
                  <span className="block text-sm font-medium text-ink-soft">
                    {[
                      unit.stock_receipts ? formatDay(unit.stock_receipts.received_date) : null,
                      unit.stock_receipts?.supplier_name,
                      unit.locations?.name
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </dd>
              </div>
              {order ? (
                <div>
                  <dt className="text-sm font-bold uppercase tracking-wide text-ink-soft">
                    {unit.status === "sold" ? "Sold to" : "On order for"}
                  </dt>
                  <dd className="font-semibold">
                    {buyer}
                    <span className="block text-sm font-medium text-ink-soft">
                      <Link href={`${base}/orders/${order.id}`} className={LINK}>
                        {order.order_no}
                      </Link>
                      {[unit.sold_at ? formatDate(unit.sold_at, org.timezone) : formatDay(order.order_date), phone]
                        .filter(Boolean)
                        .map((part) => ` · ${part}`)
                        .join("")}
                    </span>
                  </dd>
                </div>
              ) : null}
              {warrantyEnds ? (
                <div>
                  <dt className="text-sm font-bold uppercase tracking-wide text-ink-soft">Warranty</dt>
                  <dd>
                    {warrantyEnds.getTime() > now ? (
                      <Badge tone="success">Under warranty until {formatDate(warrantyEnds.toISOString(), org.timezone)}</Badge>
                    ) : (
                      <Badge tone="plain">Ended {formatDate(warrantyEnds.toISOString(), org.timezone)}</Badge>
                    )}
                  </dd>
                </div>
              ) : null}
            </dl>
          </ListCard>
        );
      })}
    </div>
  );
}

export default function SerialsPage(props: PageProps<"/b/[slug]/stock/serials">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Serials {...props} />
    </Suspense>
  );
}
