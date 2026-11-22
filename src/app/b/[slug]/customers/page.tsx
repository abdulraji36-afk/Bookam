import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { Badge, EmptyState, PageSkeleton } from "@/components/ui/card";
import { DataTable, TableCard } from "@/components/ui/data-table";
import { NoMatches, Pager, SearchForm } from "@/components/ui/list-search";
import { FilterBar, PageHeader, StatusTabs } from "@/components/ui/page-header";
import { SummaryCard, SummaryCards } from "@/components/ui/summary-card";
import { describeOwed, formatQuantity } from "@/lib/format";
import { canManage, requireOrg } from "@/lib/org";
import { matchAny, readListSearch } from "@/lib/search";

export const metadata: Metadata = { title: "Customers" };

async function Customers({ params, searchParams }: PageProps<"/b/[slug]/customers">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { supabase, org, role, t } = await requireOrg(slug);
  const base = `/b/${org.slug}/customers`;
  const manager = canManage(role);
  const search = readListSearch(query, 50);
  const showOff = query.status === "off";

  let listQuery = supabase
    .from("customers")
    .select("id, name, phone, area, address, is_active", { count: "exact" })
    .eq("organization_id", org.id)
    .eq("is_active", !showOff)
    .order("name")
    .range(search.from, search.to);
  if (search.q) listQuery = listQuery.or(matchAny(search.q, ["name", "area", "phone"]));

  // Bilikis's customer cards for a drinks depot, from what each customer has bought.
  const channelsQuery = org.sells_drinks
    ? supabase
        .from("order_summaries")
        .select("customer_id, has_returns")
        .eq("organization_id", org.id)
        .is("voided_at", null)
        .not("customer_id", "is", null)
        .limit(20000)
    : Promise.resolve({ data: [] });
  const [listResult, activeCount, offCount, channelsResult] = await Promise.all([
    listQuery,
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("is_active", true),
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("is_active", false),
    channelsQuery
  ]);
  const channels = new Map<string, Set<"RGB" | "PET">>();
  for (const row of channelsResult.data ?? []) {
    if (!row.customer_id) continue;
    const kinds = channels.get(row.customer_id) ?? new Set();
    kinds.add(row.has_returns ? "RGB" : "PET");
    channels.set(row.customer_id, kinds);
  }
  const buying = [...channels.values()];
  const rgbBuyers = buying.filter((kinds) => kinds.has("RGB")).length;
  const petBuyers = buying.filter((kinds) => kinds.has("PET")).length;
  const bothBuyers = buying.filter((kinds) => kinds.size === 2).length;
  const customers = listResult.data ?? [];

  const { data: balanceData } =
    customers.length && org.tracks_returns
      ? await supabase
          .from("customer_returnable_balances")
          .select("customer_id, returnable_name, owed")
          .eq("organization_id", org.id)
          .in(
            "customer_id",
            customers.map((customer) => customer.id)
          )
      : { data: [] };
  const balances = new Map<string, { name: string; owed: number }[]>();
  for (const balance of balanceData ?? []) {
    balances.set(balance.customer_id, [
      ...(balances.get(balance.customer_id) ?? []),
      { name: balance.returnable_name, owed: Number(balance.owed) }
    ]);
  }
  const href = (status: string, page = 1) => {
    const params = new URLSearchParams();
    if (status === "off") params.set("status", "off");
    if (search.q) params.set("q", search.q);
    if (page > 1) params.set("page", String(page));
    const text = params.toString();
    return `${base}${text ? `?${text}` : ""}`;
  };

  type Customer = (typeof customers)[number];
  return (
    <div className="space-y-5">
      <PageHeader
        title="Customers"
        sub={manager ? "The shops and people you sell to. Open a customer to change them or switch them off." : "The shops and people you sell to."}
        actions={
          <Link href={`${base}/new`} className={buttonClass("primary")}>
            + New customer
          </Link>
        }
      />
      {org.sells_drinks ? (
        <SummaryCards columns={3}>
          <SummaryCard label="Total customers" value={formatQuantity((activeCount.count ?? 0) + (offCount.count ?? 0))} />
          <SummaryCard label={t("Bought PET / RGB")} value={`${formatQuantity(petBuyers)} / ${formatQuantity(rgbBuyers)}`} />
          <SummaryCard label="Both channels" value={formatQuantity(bothBuyers)} />
        </SummaryCards>
      ) : null}
      <FilterBar>
        <SearchForm action={base} q={search.q} label="Search customers" placeholder="Search by name, area or phone" />
        <StatusTabs
          label="Customer status"
          current={showOff ? "off" : "active"}
          hrefFor={(value) => href(value)}
          tabs={[
            { value: "active", label: "Active", count: activeCount.count ?? 0 },
            { value: "off", label: "Switched off", count: offCount.count ?? 0 }
          ]}
        />
      </FilterBar>

      {(activeCount.count ?? 0) + (offCount.count ?? 0) === 0 ? (
        <EmptyState title="No customers yet">Add the first customer you sell to.</EmptyState>
      ) : search.q && customers.length === 0 ? (
        <NoMatches q={search.q} base={base} />
      ) : (
        <TableCard>
          <DataTable
            label="Customers"
            rows={customers}
            rowKey={(customer: Customer) => customer.id}
            rowHref={manager ? (customer: Customer) => `${base}/${customer.id}` : undefined}
            empty={showOff ? "No customers are switched off." : "No active customers."}
            columns={[
              { header: "Customer", wrap: true, cell: (customer: Customer) => customer.name },
              { header: "Area", cell: (customer: Customer) => customer.area ?? <span className="text-ink-soft">—</span> },
              { header: "Phone", cell: (customer: Customer) => customer.phone ?? <span className="text-ink-soft">—</span> },
              ...(org.tracks_returns
                ? [
                    {
                      header: org.sells_drinks ? "Empties" : "Returnables",
                      phone: "badge" as const,
                      cell: (customer: Customer) => {
                        const owed = balances.get(customer.id) ?? [];
                        return owed.length === 0 ? (
                          <span className="text-ink-soft">—</span>
                        ) : (
                          <span className="flex flex-wrap gap-1.5">
                            {owed.map((balance) => (
                              <Badge key={balance.name} tone={balance.owed > 0 ? "solid" : "plain"}>
                                {org.sells_drinks ? "" : `${balance.name}: `}
                                {describeOwed(balance.owed)}
                              </Badge>
                            ))}
                          </span>
                        );
                      }
                    }
                  ]
                : [])
            ]}
          />
        </TableCard>
      )}
      <Pager base={base} search={search} total={listResult.count ?? 0} hrefFor={(page) => href(showOff ? "off" : "active", page)} />
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
