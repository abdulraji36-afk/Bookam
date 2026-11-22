import type { Metadata } from "next";
import { Suspense } from "react";
import { saveProductAction } from "@/app/actions/catalog";
import { ProductForm } from "@/components/catalog/product-form";
import { Card, PageSkeleton, PageTitle } from "@/components/ui/card";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";

export const metadata: Metadata = { title: "New product" };

async function NewProduct({ params }: Pick<PageProps<"/b/[slug]/products/new">, "params">) {
  const { slug } = await params;
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);
  // A drinks business's own categories (Beer, Malt...), offered again.
  const { data: categoryRows } = org.sells_drinks
    ? await supabase.from("products").select("category").eq("organization_id", org.id).not("category", "is", null).limit(1000)
    : { data: [] };
  const categories = [...new Set((categoryRows ?? []).map((row) => row.category as string))].sort();
  const { data: returnables } = await supabase
    .from("returnable_items")
    .select("name")
    .eq("organization_id", org.id)
    .order("name");

  return (
    <div className="max-w-2xl space-y-6">
      <PageTitle>New product</PageTitle>
      <Card>
        <ProductForm
          categories={categories}
          action={saveProductAction.bind(null, org.slug, null)}
          currency={org.currency_code}
          returnables={(returnables ?? []).map((item) => item.name)}
          features={{
            returns: org.tracks_returns,
            serials: org.tracks_serials,
            serialByDefault: org.selling_mode === "serial",
            drinks: org.sells_drinks
          }}
        />
      </Card>
    </div>
  );
}

export default function NewProductPage({ params }: PageProps<"/b/[slug]/products/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewProduct params={params} />
    </Suspense>
  );
}
