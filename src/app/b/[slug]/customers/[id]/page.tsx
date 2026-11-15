import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { saveCustomerAction, setCustomerActiveAction } from "@/app/actions/catalog";
import { ActionButton } from "@/components/team/action-button";
import { ActionsPanel } from "@/components/ui/page-header";
import { CustomerForm } from "@/components/catalog/customer-form";
import { Badge, Card, CardHeader, PageSkeleton, PageTitle } from "@/components/ui/card";
import { describeOwed } from "@/lib/format";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";

export const metadata: Metadata = { title: "Edit customer" };

async function EditCustomer({ params }: Pick<PageProps<"/b/[slug]/customers/[id]">, "params">) {
  const { slug, id } = await params;
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);

  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, phone, area, address, is_active")
    .eq("organization_id", org.id)
    .eq("id", id)
    .maybeSingle();
  if (!customer) notFound();
  const { data: balances } = await supabase
    .from("customer_returnable_balances")
    .select("returnable_name, owed")
    .eq("customer_id", customer.id);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="page-head">
        <PageTitle sub="Change their details, or switch them off when you stop selling to them.">{customer.name}</PageTitle>
        {customer.is_active ? null : <Badge tone="accent">Switched off</Badge>}
      </div>
      {(balances ?? []).length > 0 ? (
        <Card>
          <CardHeader title={org.sells_drinks ? "Empties" : "Returnables"} />
          <ul className="-my-2 divide-y divide-line">
            {(balances ?? []).map((balance) => (
              <li key={balance.returnable_name} className="flex items-center justify-between gap-3 py-2">
                <span className="font-bold">{balance.returnable_name}</span>
                <Badge tone={Number(balance.owed) > 0 ? "solid" : "plain"}>{describeOwed(Number(balance.owed))}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
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
      <ActionsPanel>
        <p className="text-sm font-medium text-ink-soft">
          {customer.is_active
            ? "A switched-off customer no longer appears when taking orders. Their history and balances stay."
            : "Switch them back on to take orders for them again."}
        </p>
        <ActionButton
          action={setCustomerActiveAction.bind(null, org.slug, customer.id, !customer.is_active)}
          label={customer.is_active ? "Switch off this customer" : "Switch this customer back on"}
          variant={customer.is_active ? "danger" : "secondary"}
          showSuccess
        />
      </ActionsPanel>
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
