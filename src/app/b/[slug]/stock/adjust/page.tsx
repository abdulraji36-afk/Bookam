import type { Metadata } from "next";
import { Suspense } from "react";
import { recordStockAdjustmentAction, voidStockAdjustmentAction } from "@/app/actions/stock";
import { ReasonForm } from "@/components/corrections/reason-form";
import { AdjustStockForm } from "@/components/stock/adjust-stock-form";
import { Alert } from "@/components/ui/alert";
import { Badge, Card, EmptyState, ListCard, PageSkeleton, PageTitle } from "@/components/ui/card";
import { describeUnit, formatDate, formatQuantity, STOCK_REASON_LABELS, todayIn } from "@/lib/format";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Write off or correct stock" };

async function AdjustStock({ params, searchParams }: PageProps<"/b/[slug]/stock/adjust">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);

  const [productsResult, locationsResult, levelsResult, unitsResult, recentResult] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, unit, tracks_serials")
      .eq("organization_id", org.id)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("locations")
      .select("id, name")
      .eq("organization_id", org.id)
      .eq("is_active", true)
      .order("created_at"),
    supabase.from("product_stock_levels").select("product_id, location_id, on_hand").eq("organization_id", org.id),
    supabase
      .from("product_units")
      .select("id, product_id, location_id, serial_no, colour")
      .eq("organization_id", org.id)
      .eq("status", "in_stock")
      .order("serial_no")
      .limit(5000),
    supabase
      .from("stock_adjustments")
      .select(
        "id, adjustment_date, quantity_delta, reason, note, voided_at, void_reason, products (name, unit), locations (name), profiles!stock_adjustments_created_by_fkey (full_name), product_units (serial_no, colour)"
      )
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .limit(20)
  ]);

  const products = (productsResult.data ?? []).map((product) => ({
    id: product.id,
    name: product.name,
    unit: product.unit,
    tracksSerials: product.tracks_serials
  }));
  const locations = locationsResult.data ?? [];
  const stock: Record<string, Record<string, number>> = {};
  for (const level of levelsResult.data ?? []) {
    (stock[level.location_id] ??= {})[level.product_id] = Number(level.on_hand);
  }
  const units = (unitsResult.data ?? []).map((unit) => ({
    id: unit.id,
    productId: unit.product_id,
    locationId: unit.location_id,
    serial: unit.serial_no,
    colour: unit.colour
  }));
  const recent = recentResult.data ?? [];

  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle sub="Take out stock that was damaged, expired, lost or stolen, or put right a count that is off. Every change is kept with its reason.">
        Write off or correct stock
      </PageTitle>

      {query.saved ? <Alert tone="success">Stock updated.</Alert> : null}

      {products.length === 0 ? (
        <EmptyState title="No products yet">Add your products first.</EmptyState>
      ) : (
        <Card>
          <AdjustStockForm
            action={recordStockAdjustmentAction.bind(null, org.slug)}
            products={products}
            locations={locations}
            units={units}
            stock={stock}
            today={todayIn(org.timezone, await requestNow())}
          />
        </Card>
      )}

      {recent.length > 0 ? (
        <ListCard title="Recent changes">
          <ul className="divide-y divide-line">
            {recent.map((adjustment) => {
              const delta = Number(adjustment.quantity_delta);
              const serials = adjustment.product_units.map(describeUnit).join(", ");
              return (
                <li key={adjustment.id} className="space-y-2 px-5 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <span className="min-w-0">
                      <span className="block font-extrabold">
                        {adjustment.products?.name}: {STOCK_REASON_LABELS[adjustment.reason]}
                      </span>
                      <span className="text-sm font-medium text-ink-soft">
                        {[
                          formatDate(adjustment.adjustment_date, "UTC"),
                          locations.length > 1 ? adjustment.locations?.name : null,
                          adjustment.profiles?.full_name,
                          adjustment.note
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {serials ? <span className="block text-sm font-medium text-ink-soft">{serials}</span> : null}
                    </span>
                    {adjustment.voided_at ? (
                      <Badge tone="accent">Voided</Badge>
                    ) : (
                      <span className={`font-extrabold tabular-nums ${delta < 0 ? "text-danger" : ""}`}>
                        {delta > 0 ? "+" : "−"}
                        {formatQuantity(Math.abs(delta))} {adjustment.products?.unit}
                      </span>
                    )}
                  </div>
                  {adjustment.voided_at ? (
                    adjustment.void_reason ? (
                      <p className="text-sm font-medium text-ink-soft">Voided: {adjustment.void_reason}</p>
                    ) : null
                  ) : (
                    <ReasonForm
                      compact
                      action={voidStockAdjustmentAction.bind(null, org.slug, adjustment.id)}
                      trigger="Void this change"
                      explanation="Use this when the change was recorded by mistake. The stock goes back to what it was before."
                      submitLabel="Void change"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </ListCard>
      ) : null}
    </div>
  );
}

export default function AdjustStockPage(props: PageProps<"/b/[slug]/stock/adjust">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdjustStock {...props} />
    </Suspense>
  );
}
