import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { addNbcProductsAction } from "@/app/actions/catalog";
import { NbcListForm } from "@/components/catalog/nbc-list-form";
import { Card, PageSkeleton, PageTitle } from "@/components/ui/card";
import { NBC_PRODUCTS } from "@/lib/nbc-products";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";

export const metadata: Metadata = { title: "Add from the NBC list" };

async function NbcList({ params }: Pick<PageProps<"/b/[slug]/products/nbc">, "params">) {
  const { slug } = await params;
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);
  if (!org.sells_drinks) notFound();

  const { data } = await supabase.from("products").select("name, sku").eq("organization_id", org.id);
  const have = new Set((data ?? []).flatMap((row) => [row.name.toLowerCase(), (row.sku ?? "").toLowerCase()]));

  return (
    <div className="space-y-6">
      <PageTitle sub="The Coca-Cola (NBC) drinks, as on the Bilikis price list. Tick the ones you sell and enter each price and cost.">
        Add from the NBC list
      </PageTitle>
      <Card>
        <NbcListForm
          action={addNbcProductsAction.bind(null, org.slug)}
          currency={org.currency_code}
          products={NBC_PRODUCTS.map((product) => ({
            ...product,
            added: have.has(product.name.toLowerCase()) || have.has(product.code.toLowerCase())
          }))}
        />
      </Card>
    </div>
  );
}

export default function NbcListPage({ params }: PageProps<"/b/[slug]/products/nbc">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NbcList params={params} />
    </Suspense>
  );
}
