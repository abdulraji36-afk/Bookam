import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { saveProductAction } from "@/app/actions/catalog";
import { ProductForm } from "@/components/catalog/product-form";
import { Card, PageSkeleton, PageTitle } from "@/components/ui/card";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";

export const metadata: Metadata = { title: "Edit product" };

const asText = (value: number | null | undefined) => (value == null ? "" : String(Number(value)));

async function EditProduct({ params }: Pick<PageProps<"/b/[slug]/products/[id]">, "params">) {
  const { slug, id } = await params;
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);

  const [productResult, costResult, returnablesResult] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sku, unit, selling_price, low_stock_threshold, returnable_items (name)")
      .eq("organization_id", org.id)
      .eq("id", id)
      .maybeSingle(),
    supabase.from("product_costs").select("cost_price").eq("product_id", id).maybeSingle(),
    supabase.from("returnable_items").select("name").eq("organization_id", org.id).order("name")
  ]);

  const product = productResult.data;
  if (!product) notFound();
  const lowStock = Number(product.low_stock_threshold);

  return (
    <div className="max-w-2xl space-y-6">
      <PageTitle>Edit product</PageTitle>
      <Card>
        <ProductForm
          action={saveProductAction.bind(null, org.slug, product.id)}
          currency={org.currency_code}
          returnables={(returnablesResult.data ?? []).map((item) => item.name)}
          defaults={{
            name: product.name,
            sku: product.sku ?? "",
            unit: product.unit,
            sellingPrice: asText(product.selling_price),
            costPrice: asText(costResult.data?.cost_price),
            lowStock: lowStock > 0 ? String(lowStock) : "",
            returnItemName: product.returnable_items?.name ?? ""
          }}
        />
      </Card>
    </div>
  );
}

export default function EditProductPage({ params }: PageProps<"/b/[slug]/products/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditProduct params={params} />
    </Suspense>
  );
}
