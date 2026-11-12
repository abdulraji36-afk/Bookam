import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { recordStockReceiptAction } from "@/app/actions/stock";
import { ReceiveStockForm } from "@/components/stock/receive-stock-form";
import { Card, EmptyState, PageSkeleton, PageTitle } from "@/components/ui/card";
import { todayIn } from "@/lib/format";
import { canManage, requireOrg } from "@/lib/org";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Receive stock" };

async function ReceiveStock({ params }: Pick<PageProps<"/b/[slug]/stock/receive">, "params">) {
  const { slug } = await params;
  const { supabase, org, role } = await requireOrg(slug);

  const [productsResult, locationsResult] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, unit")
      .eq("organization_id", org.id)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("locations")
      .select("id, name")
      .eq("organization_id", org.id)
      .eq("is_active", true)
      .order("created_at")
  ]);
  const products = productsResult.data ?? [];

  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle sub="Record goods as they arrive. They are added to your stock straight away.">
        Receive stock
      </PageTitle>
      {products.length === 0 ? (
        <EmptyState title="Add a product first">
          {canManage(role) ? (
            <Link
              href={`/b/${org.slug}/products/new`}
              className="font-extrabold text-ink underline decoration-accent decoration-4 underline-offset-4"
            >
              Create your first product
            </Link>
          ) : (
            "An owner or admin needs to add products before stock can be received."
          )}
        </EmptyState>
      ) : (
        <Card>
          <ReceiveStockForm
            action={recordStockReceiptAction.bind(null, org.slug)}
            products={products}
            locations={locationsResult.data ?? []}
            today={todayIn(org.timezone, await requestNow())}
          />
        </Card>
      )}
    </div>
  );
}

export default function ReceiveStockPage({ params }: PageProps<"/b/[slug]/stock/receive">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReceiveStock params={params} />
    </Suspense>
  );
}
