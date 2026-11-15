import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { saveProductAction, setProductActiveAction } from "@/app/actions/catalog";
import { ActionButton } from "@/components/team/action-button";
import { ActionsPanel } from "@/components/ui/page-header";
import { ProductForm } from "@/components/catalog/product-form";
import { Badge, Card, PageSkeleton, PageTitle } from "@/components/ui/card";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";

export const metadata: Metadata = { title: "Edit product" };

const asText = (value: number | null | undefined) => (value == null ? "" : String(Number(value)));

async function EditProduct({ params }: Pick<PageProps<"/b/[slug]/products/[id]">, "params">) {
  const { slug, id } = await params;
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);

  const [productResult, costResult, returnablesResult] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sku, unit, selling_price, low_stock_threshold, tracks_serials, warranty_months, category, is_active, returnable_items (name)")
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
      <div className="page-head">
        <PageTitle sub="Change its details, or switch it off when you stop selling it.">{product.name}</PageTitle>
        {product.is_active ? null : <Badge tone="accent">Switched off</Badge>}
      </div>
      <Card>
        <ProductForm
          action={saveProductAction.bind(null, org.slug, product.id)}
          currency={org.currency_code}
          returnables={(returnablesResult.data ?? []).map((item) => item.name)}
          features={{ returns: org.tracks_returns, serials: org.tracks_serials, drinks: org.sells_drinks }}
          defaults={{
            name: product.name,
            sku: product.sku ?? "",
            unit: product.unit,
            sellingPrice: asText(product.selling_price),
            costPrice: asText(costResult.data?.cost_price),
            lowStock: lowStock > 0 ? String(lowStock) : "",
            returnItemName: product.returnable_items?.name ?? "",
            category: product.category ?? undefined,
            tracksSerials: product.tracks_serials,
            warrantyMonths: product.warranty_months ? String(product.warranty_months) : ""
          }}
        />
      </Card>
      <ActionsPanel>
        <p className="text-sm font-medium text-ink-soft">
          {product.is_active
            ? "A switched-off product can no longer be ordered or received. Its history stays."
            : "Switch it back on to order and receive it again."}
        </p>
        <ActionButton
          action={setProductActiveAction.bind(null, org.slug, product.id, !product.is_active)}
          label={product.is_active ? "Switch off this product" : "Switch this product back on"}
          variant={product.is_active ? "danger" : "secondary"}
          showSuccess
        />
      </ActionsPanel>
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
