import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { saveOrderAction, saveOrderBatchAction } from "@/app/actions/orders";
import { BatchOrderForm } from "@/components/orders/batch-order-form";
import { OrderForm } from "@/components/orders/order-form";
import { buttonClass } from "@/components/ui/button";
import { StatusTabs } from "@/components/ui/page-header";
import { Card, EmptyState, PageSkeleton, PageTitle } from "@/components/ui/card";
import { categoryOrder, todayIn } from "@/lib/format";
import { getOrderFormData } from "@/lib/order-form-data";
import { requireOrg } from "@/lib/org";
import { requestNow } from "@/lib/request-time";
import { saleWords } from "@/lib/selling";

export const metadata: Metadata = { title: "New order" };

const LINK = "font-extrabold text-ink underline decoration-accent decoration-4 underline-offset-4";

async function NewOrder({ params, searchParams }: PageProps<"/b/[slug]/orders/new">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { supabase, org } = await requireOrg(slug);
  const data = await getOrderFormData(supabase, org.id);
  const base = `/b/${org.slug}`;
  const today = todayIn(org.timezone, await requestNow());
  // Drinks: an order is either RGB or PET, chosen with the tabs at the top.
  const kind = query.kind === "pet" ? "pet" : "rgb";
  const kindHref = (value: string, single = query.single === "1") =>
    `${base}/orders/new?${new URLSearchParams({ ...(single ? { single: "1" } : {}), kind: value }).toString()}`;
  const kindTabs = org.sells_drinks ? (
    <StatusTabs
      label="Kind of order"
      current={kind}
      hrefFor={(value) => kindHref(value)}
      tabs={[
        { value: "rgb", label: "RGB orders (empties come back)" },
        { value: "pet", label: "PET orders" }
      ]}
    />
  ) : null;
  const products = org.sells_drinks
    ? data.products.filter((product) => product.returnable === (kind === "rgb"))
    : data.products;

  // Drinks: several customers on one screen, like the Bilikis RGB sales page.
  // A single order (for a walk-in or the counter) is still one tap away.
  if (org.sells_drinks && query.single !== "1" && data.products.length > 0) {
    const { data: categories } = await supabase
      .from("products")
      .select("id, category, returnable_item_id")
      .eq("organization_id", org.id)
      .eq("is_active", true);
    const categoryOf = new Map(
      (categories ?? []).map((row) => [row.id, row.returnable_item_id ? "RGB" : (row.category ?? "PET")])
    );
    return (
      <div className="max-w-7xl space-y-6">
        <div className="page-head">
          <PageTitle sub="Add each customer and what they are taking. Stock left on each product counts down as you type.">
            {kind === "rgb" ? "New RGB orders" : "New PET orders"}
          </PageTitle>
          <Link href={kindHref(kind, true)} className={buttonClass("secondary")}>
            One order or a walk-in instead
          </Link>
        </div>
        {kindTabs}
        <BatchOrderForm
          key={kind}
          action={saveOrderBatchAction.bind(null, org.slug)}
          customers={data.customers}
          products={products
            .filter((product) => !product.tracksSerials)
            .map((product) => ({
              id: product.id,
              name: product.name,
              unit: product.unit,
              price: product.price,
              category: categoryOf.get(product.id) ?? "PET"
            }))
            .sort((left, right) => categoryOrder(left.category) - categoryOrder(right.category) || left.name.localeCompare(right.name))}
          locations={data.locations}
          stock={data.stock}
          currency={org.currency_code}
          today={today}
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="page-head">
        <PageTitle sub="Stock is set aside for the customer as soon as you save.">
          {org.sells_drinks
            ? kind === "rgb"
              ? "New RGB order"
              : "New PET order"
            : `New ${saleWords(org.selling_mode).one}`}
        </PageTitle>
        {org.sells_drinks ? (
          <Link href={kindHref(kind, false)} className={buttonClass("secondary")}>
            Several customers instead
          </Link>
        ) : null}
      </div>
      {kindTabs}
      {products.length === 0 ? (
        <EmptyState title="Add a product first">
          <Link href={`${base}/products`} className={LINK}>
            Go to products
          </Link>
        </EmptyState>
      ) : (
        <Card>
          <OrderForm
            action={saveOrderAction.bind(null, org.slug, null)}
            currency={org.currency_code}
            mode={org.selling_mode}
            delivers={org.does_delivery}
            today={today}
            {...data}
            products={products}
          />
        </Card>
      )}
    </div>
  );
}

export default function NewOrderPage(props: PageProps<"/b/[slug]/orders/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewOrder {...props} />
    </Suspense>
  );
}
