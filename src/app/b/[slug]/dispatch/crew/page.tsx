import type { Metadata } from "next";
import { Suspense } from "react";
import { saveWorkerAction } from "@/app/actions/crew";
import { WorkerForm } from "@/components/dispatch/worker-form";
import { Badge, Card, CardHeader, PageSkeleton } from "@/components/ui/card";
import { DataTable, TableCard } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { canManage, requireOrg } from "@/lib/org";

export const metadata: Metadata = { title: "Drivers and workers" };

async function Crew({ params }: Pick<PageProps<"/b/[slug]/dispatch/crew">, "params">) {
  const { slug } = await params;
  const { supabase, org, role } = await requireOrg(slug);
  const manager = canManage(role);

  const { data } = await supabase
    .from("dispatch_workers")
    .select("id, name, role, phone, is_active")
    .eq("organization_id", org.id)
    .order("is_active", { ascending: false })
    .order("role")
    .order("name");
  const workers = data ?? [];
  type Worker = (typeof workers)[number];

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader
        title="Drivers and workers"
        sub={manager ? "The people who go out on trips. Open someone to change them or switch them off." : "The people who go out on trips."}
      />
      {manager ? (
        <Card>
          <CardHeader title="Add someone" />
          <WorkerForm action={saveWorkerAction.bind(null, org.slug, null)} />
        </Card>
      ) : null}
      <TableCard>
        <DataTable
          label="Drivers and workers"
          rows={workers}
          rowKey={(worker: Worker) => worker.id}
          rowHref={manager ? (worker: Worker) => `/b/${org.slug}/dispatch/crew/${worker.id}` : undefined}
          empty="Nobody on the list yet."
          columns={[
            {
              header: "Name",
              wrap: true,
              cell: (worker: Worker) => <span className={worker.is_active ? "" : "text-ink-soft line-through"}>{worker.name}</span>
            },
            {
              header: "Role",
              phone: "badge",
              cell: (worker: Worker) => <Badge tone={worker.role === "driver" ? "solid" : "plain"}>{worker.role === "driver" ? "Driver" : "Worker"}</Badge>
            },
            { header: "Phone", cell: (worker: Worker) => worker.phone ?? <span className="text-ink-soft">—</span> },
            {
              header: "Status",
              cell: (worker: Worker) => (worker.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="accent">Switched off</Badge>)
            }
          ]}
        />
      </TableCard>
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
