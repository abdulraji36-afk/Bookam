import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { setCustomerActiveAction } from "@/app/actions/catalog";
import { ActionButton } from "@/components/team/action-button";
import { buttonClass } from "@/components/ui/button";
import { NoMatches, Pager, SearchForm } from "@/components/ui/list-search";
import { Badge, Card, EmptyState, PageSkeleton, PageTitle } from "@/components/ui/card";
import { describeOwed } from "@/lib/format";
import { canManage, requireOrg } from "@/lib/org";
import { matchAny, readListSearch } from "@/lib/search";

export const metadata: Metadata = { title: "Customers" };

async function Customers({ params, searchParams }: PageProps<"/b/[slug]/customers">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { supabase, org, role } = await requireOrg(slug);
  const base = `/b/${org.slug}/customers`;
  const manager = canManage(role);

  const search = readListSearch(query, 50);

  let listQuery = supabase
    .from("customers")
    .select("id, name, phone, area, is_active", { count: "exact" })
    .eq("organization_id", org.id)
    .order("is_active", { ascending: false })
    .order("name")
    .range(search.from, search.to);
  if (search.q) listQuery = listQuery.or(matchAny(search.q, ["name", "area", "phone"]));
  const { data, count } = await listQuery;
  const customers = data ?? [];

  const { data: balanceData } = customers.length
    ? await supabase
        .from("customer_returnable_balances")
        .select("customer_id, returnable_name, owed")
        .eq("organization_id", org.id)
        .in(
          "customer_id",
          customers.map((customer) => customer.id)
        )
    : { data: [] };
  const balances = new Map<string, { returnable_name: string; owed: number }[]>();
  for (const balance of balanceData ?? []) {
    const list = balances.get(balance.customer_id) ?? [];
    list.push({ returnable_name: balance.returnable_name, owed: Number(balance.owed) });
    balances.set(balance.customer_id, list);
  }

  return (
    <div className="space-y-6">
      <div className="page-head">
        <PageTitle sub="The shops and people you deliver to.">Customers</PageTitle>
        <Link href={`${base}/new`} className={buttonClass("primary")}>
          + New customer
        </Link>
      </div>

      {customers.length > 0 || search.q ? (
        <SearchForm action={base} q={search.q} label="Search customers" placeholder="Search by name, area or phone" />
      ) : null}

      {customers.length === 0 ? (
        search.q ? (
          <NoMatches q={search.q} base={base} />
        ) : (
          <EmptyState title="No customers yet">Add the first customer you deliver to.</EmptyState>
        )
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
      <Pager base={base} search={search} total={count ?? 0} />
    </div>
  );
}

export default function CustomersPage(props: PageProps<"/b/[slug]/customers">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Customers {...props} />
    </Suspense>
  );
}
