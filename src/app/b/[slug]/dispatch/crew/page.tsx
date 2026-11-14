import type { Metadata } from "next";
import { Suspense } from "react";
import { setWorkerActiveAction, saveWorkerAction } from "@/app/actions/crew";
import { WorkerForm } from "@/components/dispatch/worker-form";
import { ActionButton } from "@/components/team/action-button";
import { Badge, Card, CardHeader, ListCard, PageSkeleton, PageTitle } from "@/components/ui/card";
import { canManage, requireOrg } from "@/lib/org";

export const metadata: Metadata = { title: "Drivers and loaders" };

async function Crew({ params }: Pick<PageProps<"/b/[slug]/dispatch/crew">, "params">) {
  const { slug } = await params;
  const { supabase, org, role } = await requireOrg(slug);
  const manager = canManage(role);

  const { data } = await supabase
    .from("dispatch_workers")
    .select("id, name, role, phone, is_active")
    .eq("organization_id", org.id)
    .order("is_active", { ascending: false })
    .order("name");
  const workers = data ?? [];

  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle sub="The people who go out on trips. Choose them when you create a trip.">Drivers and loaders</PageTitle>
      {manager ? (
        <Card>
          <CardHeader title="Add someone" />
          <WorkerForm action={saveWorkerAction.bind(null, org.slug)} />
        </Card>
      ) : null}
      {(["driver", "loader"] as const).map((group) => {
        const rows = workers.filter((worker) => worker.role === group);
        return (
          <ListCard key={group} title={group === "driver" ? `Drivers (${rows.length})` : `Loaders (${rows.length})`}>
            {rows.length === 0 ? (
              <p className="px-5 py-4 font-medium text-ink-soft">No {group}s yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {rows.map((worker) => (
                  <li key={worker.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <span className="min-w-0">
                      <span className={`block font-extrabold ${worker.is_active ? "" : "text-ink-soft line-through"}`}>
                        {worker.name}
                      </span>
                      {worker.phone ? <span className="text-sm font-medium text-ink-soft">{worker.phone}</span> : null}
                    </span>
                    <span className="flex items-center gap-2">
                      {!worker.is_active ? <Badge tone="accent">Switched off</Badge> : null}
                      {manager ? (
                        <ActionButton
                          action={setWorkerActiveAction.bind(null, org.slug, worker.id, !worker.is_active)}
                          label={worker.is_active ? "Switch off" : "Switch on"}
                          variant={worker.is_active ? "danger" : "secondary"}
                        />
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </ListCard>
        );
      })}
    </div>
  );
}

export default function CrewPage({ params }: PageProps<"/b/[slug]/dispatch/crew">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Crew params={params} />
    </Suspense>
  );
}
