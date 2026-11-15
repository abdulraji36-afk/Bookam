import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { saveOrderAction, saveOrderBatchAction } from "@/app/actions/orders";
import { BatchOrderForm } from "@/components/orders/batch-order-form";
import { OrderForm } from "@/components/orders/order-form";
import {
  Card,
  EmptyState,
  PageSkeleton,
  PageTitle,
} from "@/components/ui/card";
import { StatusTabs } from "@/components/ui/page-header";
import { categoryOrder, todayIn } from "@/lib/format";
import { getOrderFormData } from "@/lib/order-form-data";
import { requireOrg } from "@/lib/org";
import { requestNow } from "@/lib/request-time";
import { saleWords } from "@/lib/selling";

export const metadata: Metadata = { title: "New order" };

const LINK =
  "font-extrabold text-ink underline decoration-accent decoration-4 underline-offset-4";

async function NewOrder({
  params,
  searchParams,
}: PageProps<"/b/[slug]/orders/new">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { supabase, org } = await requireOrg(slug);
  const base = `/b/${org.slug}`;
  const kind = query.kind === "pet" ? "pet" : "rgb";

  // The old "one order" address: there is only this page now.
  if (query.single !== undefined)
    redirect(
      `${base}/orders/new${query.kind === undefined ? "" : `?kind=${kind}`}`,
    );

  const data = await getOrderFormData(supabase, org.id);
  const today = todayIn(org.timezone, await requestNow());

  // Drinks: customers and walk-in buyers together on one screen, like the
  // Bilikis RGB sales page. An order is either RGB or PET, chosen with the tabs.
  if (org.sells_drinks) {
    const { data: categories } = await supabase
      .from("products")
      .select("id, category, returnable_item_id")
      .eq("organization_id", org.id)
      .eq("is_active", true);
    const categoryOf = new Map(
      (categories ?? []).map((row) => [
        row.id,
        row.returnable_item_id ? "RGB" : (row.category ?? "PET"),
      ]),
    );
    const products = data.products
      .filter(
        (product) =>
          product.returnable === (kind === "rgb") && !product.tracksSerials,
      )
      .map((product) => ({
        id: product.id,
        name: product.name,
        unit: product.unit,
        price: product.price,
        category: categoryOf.get(product.id) ?? "PET",
      }))
      .sort(
        (left, right) =>
          categoryOrder(left.category) - categoryOrder(right.category) ||
          left.name.localeCompare(right.name),
      );

    return (
      <div className="max-w-7xl space-y-6">
        <PageTitle sub="Add each customer or walk-in buyer and what they are taking. Stock left on each product counts down as you type.">
          {kind === "rgb" ? "New RGB orders" : "New PET orders"}
        </PageTitle>
        <StatusTabs
          label="Kind of order"
          current={kind}
          hrefFor={(value) => `${base}/orders/new?kind=${value}`}
          tabs={[
            { value: "rgb", label: "RGB orders" },
            { value: "pet", label: "PET orders" },
          ]}
        />
        {data.products.length === 0 ? (
          <EmptyState title="Add a product first">
            <Link href={`${base}/products`} className={LINK}>
              Go to products
            </Link>
          </EmptyState>
        ) : (
          <BatchOrderForm
            key={kind}
            action={saveOrderBatchAction.bind(null, org.slug)}
            customers={data.customers}
            products={products}
            locations={data.locations}
            stock={data.stock}
            currency={org.currency_code}
            today={today}
            allowWalkIns={kind === "pet"}
          />
        )}
      </div>
    );
  }

  // Other businesses (phones with serial numbers, counted goods): one order at a time.
  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle sub="Stock is set aside for the customer as soon as you save.">
        New {saleWords(org.selling_mode).one}
      </PageTitle>
      {data.products.length === 0 ? (
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
