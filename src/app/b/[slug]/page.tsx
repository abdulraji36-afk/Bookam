import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, Card, CardHeader, PageSkeleton, PageTitle } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/format";
import { canManage, requireOrg } from "@/lib/org";
import { getStockRows } from "@/lib/stock";

export const metadata: Metadata = { title: "Dashboard" };

async function Dashboard({ params }: Pick<PageProps<"/b/[slug]">, "params">) {
  const { slug } = await params;
  const { supabase, org, role, user } = await requireOrg(slug);
  const base = `/b/${org.slug}`;

  const count = (table: "memberships" | "products" | "customers") =>
    supabase.from(table).select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("is_active", true);

  const [members, products, customers, received, stockRows, profile, waiting, loading, trips, returnables, returned] = await Promise.all([
    count("memberships"),
    count("products"),
    count("customers"),
    supabase.from("stock_receipts").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
    getStockRows(supabase, org.id, null),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("status", "pending"),
    supabase.from("dispatch_trips").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("status", "draft"),
    supabase.from("dispatch_trips").select("id", { count: "exact", head: true }).eq("organization_id", org.id).in("status", ["dispatched", "completed"]),
    supabase.from("returnable_totals").select("owed").eq("organization_id", org.id),
    supabase.from("trip_return_lines").select("id", { count: "exact", head: true }).eq("organization_id", org.id)
  ]);

  const firstName = profile.data?.full_name?.split(" ")[0];
  const teamCount = members.count ?? 0;
  const productCount = products.count ?? 0;
  const lowStock = stockRows.filter((row) => row.isLow).length;
  const manager = canManage(role);
  const tracksReturns = (returnables.data ?? []).length > 0;
  const owedBack = (returnables.data ?? []).reduce((sum, item) => sum + Number(item.owed), 0);
  const steps = [
    { label: "Create your business", done: true },
    { label: "Invite your team", done: teamCount > 1, href: manager ? `${base}/team` : undefined },
    {
      label: "Add the products you sell",
      done: productCount > 0,
      href: manager ? `${base}/products/new` : undefined
    },
    {
      label: "Record the stock you have",
      done: (received.count ?? 0) > 0,
      href: productCount > 0 ? `${base}/stock/receive` : undefined
    },
    {
      label: "Record an order and dispatch it",
      done: (trips.count ?? 0) > 0,
      href: (received.count ?? 0) > 0 ? `${base}/orders/new` : undefined
    },
    ...(tracksReturns
      ? [
          {
            label: "Record what customers bring back",
            done: (returned.count ?? 0) > 0,
            href: (trips.count ?? 0) > 0 ? `${base}/returns` : undefined
          }
        ]
      : [])
  ];

  return (
    <div className="space-y-6">
      <PageTitle sub={`${org.name} · you are signed in as ${ROLE_LABELS[role]}`}>
        {firstName ? `Welcome, ${firstName}` : "Welcome"}
      </PageTitle>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Waiting for dispatch" value={waiting.count ?? 0} strong href={`${base}/orders`} />
        <StatTile label="Trips loading" value={loading.count ?? 0} href={`${base}/dispatch`} />
        <StatTile label="Low stock" value={lowStock} href={`${base}/stock`} />
        {tracksReturns ? (
          <StatTile label="Owed back by customers" value={owedBack} href={`${base}/returns`} />
        ) : (
          <StatTile label="Customers" value={customers.count ?? 0} href={`${base}/customers`} />
        )}
      </div>

      <Card>
        <CardHeader title="Getting set up" />
        <ol className="space-y-3">
          {steps.map((step) => (
            <li key={step.label} className="flex items-center justify-between gap-3">
              <span className={step.done ? "text-ink-soft line-through" : "font-semibold text-ink"}>
                {step.href && !step.done ? (
                  <Link href={step.href} className="font-extrabold text-ink underline decoration-accent decoration-4 underline-offset-4">
                    {step.label}
                  </Link>
                ) : (
                  step.label
                )}
              </span>
              {step.done ? <Badge tone="solid">Done</Badge> : null}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

function StatTile({
  label,
  value,
  strong,
  href
}: {
  label: string;
  value: number;
  strong?: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-md border-2 border-transparent px-5 py-4 transition-transform duration-150 hover:-translate-y-0.5 hover:border-accent active:translate-y-0 active:scale-[0.98] ${
        strong ? "bg-ink text-white" : "bg-white"
      }`}
    >
      <p className="text-5xl font-extrabold leading-none tabular-nums">{value}</p>
      <p
        className={`mt-2 text-sm font-bold uppercase tracking-wide ${strong ? "text-nav" : "text-ink-soft"}`}
      >
        {label}
      </p>
    </Link>
  );
}

export default function DashboardPage({ params }: PageProps<"/b/[slug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dashboard params={params} />
    </Suspense>
  );
}
