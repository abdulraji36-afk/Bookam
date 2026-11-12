import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { saveOrderAction } from "@/app/actions/orders";
import { OrderForm } from "@/components/orders/order-form";
import { Card, EmptyState, PageSkeleton, PageTitle } from "@/components/ui/card";
import { todayIn } from "@/lib/format";
import { getOrderFormData } from "@/lib/order-form-data";
import { requireOrg } from "@/lib/org";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "New order" };

const LINK = "font-extrabold text-ink underline decoration-accent decoration-4 underline-offset-4";

async function NewOrder({ params }: Pick<PageProps<"/b/[slug]/orders/new">, "params">) {
  const { slug } = await params;
  const { supabase, org } = await requireOrg(slug);
  const data = await getOrderFormData(supabase, org.id);
  const base = `/b/${org.slug}`;

  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle sub="Stock is set aside for the customer as soon as you save.">New order</PageTitle>
      {data.customers.length === 0 ? (
        <EmptyState title="Add a customer first">
          <Link href={`${base}/customers/new`} className={LINK}>
            Add your first customer
          </Link>
        </EmptyState>
      ) : data.products.length === 0 ? (
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
            today={todayIn(org.timezone, await requestNow())}
            {...data}
          />
        </Card>
      )}
    </div>
  );
}

export default function NewOrderPage({ params }: PageProps<"/b/[slug]/orders/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewOrder params={params} />
    </Suspense>
  );
}
