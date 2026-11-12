import type { Metadata } from "next";
import { Suspense } from "react";
import { saveCustomerAction } from "@/app/actions/catalog";
import { CustomerForm } from "@/components/catalog/customer-form";
import { Card, PageSkeleton, PageTitle } from "@/components/ui/card";
import { requireOrg } from "@/lib/org";

export const metadata: Metadata = { title: "New customer" };

async function NewCustomer({ params }: Pick<PageProps<"/b/[slug]/customers/new">, "params">) {
  const { slug } = await params;
  const { org } = await requireOrg(slug);

  return (
    <div className="max-w-2xl space-y-6">
      <PageTitle>New customer</PageTitle>
      <Card>
        <CustomerForm action={saveCustomerAction.bind(null, org.slug, null)} />
      </Card>
    </div>
  );
}

export default function NewCustomerPage({ params }: PageProps<"/b/[slug]/customers/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewCustomer params={params} />
    </Suspense>
  );
}
