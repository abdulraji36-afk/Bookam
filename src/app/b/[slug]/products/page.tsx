import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { setProductActiveAction } from "@/app/actions/catalog";
import { ActionButton } from "@/components/team/action-button";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageSkeleton, PageTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { canManage, requireOrg } from "@/lib/org";

export const metadata: Metadata = { title: "Products" };

async function Products({ params }: Pick<PageProps<"/b/[slug]/products">, "params">) {
  const { slug } = await params;
  const { supabase, org, role } = await requireOrg(slug);
  const base = `/b/${org.slug}/products`;
  const manager = canManage(role);

  const { data } = await supabase
    .from("products")
    .select("id, name, sku, unit, selling_price, is_active, returnable_items (name)")
    .eq("organization_id", org.id)
    .order("is_active", { ascending: false })
    .order("name");
  const products = data ?? [];

  return (
    <div className="space-y-6">
      <div className="page-head">
        <PageTitle sub="What you sell, and whether customers must bring something back.">Products</PageTitle>
        {manager ? (
          <Link href={`${base}/new`} className={buttonClass("primary")}>
            + New product
          </Link>
        ) : null}
      </div>

      {products.length === 0 ? (
        <EmptyState title="No products yet">
          {manager ? "Add the first thing you sell to start tracking stock." : "An owner or admin needs to add products."}
        </EmptyState>
      ) : (
        <Card className="!p-0">
          <ul className="divide-y divide-line">
            {products.map((product) => (
              <li key={product.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className={`text-lg font-extrabold ${product.is_active ? "" : "text-ink-soft line-through"}`}>
                    {product.name}
                  </p>
                  <p className="font-medium text-ink-soft">
                    Per {product.unit} · {formatMoney(product.selling_price, org.currency_code)}
                    {product.sku ? ` · ${product.sku}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!product.is_active ? <Badge tone="accent">Switched off</Badge> : null}
                  {product.returnable_items ? (
                    <Badge tone="solid">Return due: {product.returnable_items.name}</Badge>
                  ) : (
                    <Badge>No return</Badge>
                  )}
                  {manager ? (
                    <>
                      <Link href={`${base}/${product.id}`} className={buttonClass("secondary", "sm")}>
                        Edit
                      </Link>
                      <ActionButton
                        action={setProductActiveAction.bind(null, org.slug, product.id, !product.is_active)}
                        label={product.is_active ? "Switch off" : "Switch on"}
                        variant={product.is_active ? "danger" : "secondary"}
                      />
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

export default function ProductsPage({ params }: PageProps<"/b/[slug]/products">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Products params={params} />
    </Suspense>
  );
}
