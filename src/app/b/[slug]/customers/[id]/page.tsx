import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { saveCustomerAction } from "@/app/actions/catalog";
import { CustomerForm } from "@/components/catalog/customer-form";
import { Card, PageSkeleton, PageTitle } from "@/components/ui/card";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";

export const metadata: Metadata = { title: "Edit customer" };

async function EditCustomer({ params }: Pick<PageProps<"/b/[slug]/customers/[id]">, "params">) {
  const { slug, id } = await params;
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);

  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, phone, area, address")
    .eq("organization_id", org.id)
    .eq("id", id)
    .maybeSingle();
  if (!customer) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <PageTitle>Edit customer</PageTitle>
      <Card>
        <CustomerForm
          action={saveCustomerAction.bind(null, org.slug, customer.id)}
          defaults={{
            name: customer.name,
            phone: customer.phone ?? "",
            area: customer.area ?? "",
            address: customer.address ?? ""
          }}
        />
      </Card>
    </div>
  );
}

export default function EditCustomerPage({ params }: PageProps<"/b/[slug]/customers/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditCustomer params={params} />
    </Suspense>
  );
}
