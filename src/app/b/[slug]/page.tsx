import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, Card, CardHeader, PageSkeleton } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/format";
import { canManage, requireOrg } from "@/lib/org";

export const metadata: Metadata = { title: "Dashboard" };

async function Dashboard({ params }: Pick<PageProps<"/b/[slug]">, "params">) {
  const { slug } = await params;
  const { supabase, org, role, user } = await requireOrg(slug);
  const base = `/b/${org.slug}`;

  const [members, locations, profile] = await Promise.all([
    supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("is_active", true),
    supabase
      .from("locations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("is_active", true),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
  ]);

  const firstName = profile.data?.full_name?.split(" ")[0];
  const teamCount = members.count ?? 0;
  const steps = [
    { label: "Create your business", done: true },
    {
      label: "Invite your team",
      done: teamCount > 1,
      href: canManage(role) ? `${base}/team` : undefined
    },
    { label: "Add your products and opening stock", upcoming: true },
    { label: "Record your first order and dispatch", upcoming: true }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{firstName ? `Welcome, ${firstName}` : "Welcome"}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {org.name} · you are signed in as {ROLE_LABELS[role]}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-sm text-slate-600">Team members</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{teamCount}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-600">Locations</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{locations.count ?? 0}</p>
        </Card>
      </div>

      <Card>
        <CardHeader title="Getting set up" />
        <ol className="space-y-3">
          {steps.map((step) => (
            <li key={step.label} className="flex items-center justify-between gap-3 text-sm">
              <span className={step.done ? "text-slate-500 line-through" : "text-slate-900"}>
                {step.href && !step.done ? (
                  <Link href={step.href} className="font-medium text-brand-700 underline">
                    {step.label}
                  </Link>
                ) : (
                  step.label
                )}
              </span>
              {step.done ? <Badge tone="green">Done</Badge> : null}
              {step.upcoming ? <Badge>Coming soon</Badge> : null}
            </li>
          ))}
        </ol>
      </Card>
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
