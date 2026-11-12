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

  const [members, products, customers, received, stockRows, profile] = await Promise.all([
    count("memberships"),
    count("products"),
    count("customers"),
    supabase.from("stock_receipts").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
    getStockRows(supabase, org.id, null),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
  ]);

  const firstName = profile.data?.full_name?.split(" ")[0];
  const teamCount = members.count ?? 0;
  const productCount = products.count ?? 0;
  const lowStock = stockRows.filter((row) => row.isLow).length;
  const manager = canManage(role);
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
    { label: "Record your first order and dispatch", upcoming: true }
  ];

  return (
    <div className="space-y-6">
      <PageTitle sub={`${org.name} · you are signed in as ${ROLE_LABELS[role]}`}>
        {firstName ? `Welcome, ${firstName}` : "Welcome"}
      </PageTitle>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Products" value={productCount} strong />
        <StatTile label="Low stock" value={lowStock} />
        <StatTile label="Customers" value={customers.count ?? 0} />
        <StatTile label="Team members" value={teamCount} />
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
              {step.upcoming ? <Badge>Coming soon</Badge> : null}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

function StatTile({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`rounded-md px-5 py-4 ${strong ? "bg-ink text-white" : "bg-white"}`}>
      <p className="text-5xl font-extrabold leading-none tabular-nums">{value}</p>
      <p
        className={`mt-2 text-sm font-bold uppercase tracking-wide ${strong ? "text-nav" : "text-ink-soft"}`}
      >
        {label}
      </p>
    </div>
  );
}

export default function DashboardPage({ params }: PageProps<"/b/[slug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dashboard params={params} />
    </Suspense>
  );
}
