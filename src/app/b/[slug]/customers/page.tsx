import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { setCustomerActiveAction } from "@/app/actions/catalog";
import { ActionButton } from "@/components/team/action-button";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageSkeleton, PageTitle } from "@/components/ui/card";
import { describeOwed } from "@/lib/format";
import { canManage, requireOrg } from "@/lib/org";

export const metadata: Metadata = { title: "Customers" };

async function Customers({ params }: Pick<PageProps<"/b/[slug]/customers">, "params">) {
  const { slug } = await params;
  const { supabase, org, role } = await requireOrg(slug);
  const base = `/b/${org.slug}/customers`;
  const manager = canManage(role);

  const [{ data }, { data: balanceData }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, phone, area, is_active")
      .eq("organization_id", org.id)
      .order("is_active", { ascending: false })
      .order("name"),
    supabase
      .from("customer_returnable_balances")
      .select("customer_id, returnable_name, owed")
      .eq("organization_id", org.id)
  ]);
  const customers = data ?? [];
  const balances = new Map<string, { returnable_name: string; owed: number }[]>();
  for (const balance of balanceData ?? []) {
    const list = balances.get(balance.customer_id) ?? [];
    list.push({ returnable_name: balance.returnable_name, owed: Number(balance.owed) });
    balances.set(balance.customer_id, list);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle sub="The shops and people you deliver to.">Customers</PageTitle>
        <Link href={`${base}/new`} className={buttonClass("primary")}>
          + New customer
        </Link>
      </div>

      {customers.length === 0 ? (
        <EmptyState title="No customers yet">Add the first customer you deliver to.</EmptyState>
      ) : (
        <Card className="!p-0">
          <ul className="divide-y divide-line">
            {customers.map((customer) => (
              <li key={customer.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className={`text-lg font-extrabold ${customer.is_active ? "" : "text-ink-soft line-through"}`}>
                    {customer.name}
                  </p>
                  <p className="font-medium text-ink-soft">
                    {[customer.area, customer.phone].filter(Boolean).join(" · ") || "No area or phone saved"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(balances.get(customer.id) ?? []).map((balance) => (
                    <Badge key={balance.returnable_name} tone={balance.owed > 0 ? "solid" : "plain"}>
                      {balance.returnable_name}: {describeOwed(balance.owed)}
                    </Badge>
                  ))}
                  {!customer.is_active ? <Badge tone="accent">Switched off</Badge> : null}
                  {manager ? (
                    <>
                      <Link href={`${base}/${customer.id}`} className={buttonClass("secondary", "sm")}>
                        Edit
                      </Link>
                      <ActionButton
                        action={setCustomerActiveAction.bind(null, org.slug, customer.id, !customer.is_active)}
                        label={customer.is_active ? "Switch off" : "Switch on"}
                        variant={customer.is_active ? "danger" : "secondary"}
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

export default function CustomersPage({ params }: PageProps<"/b/[slug]/customers">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Customers params={params} />
    </Suspense>
  );
}
