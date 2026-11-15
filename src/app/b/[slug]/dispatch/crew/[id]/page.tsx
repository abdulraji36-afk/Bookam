import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { saveWorkerAction, setWorkerActiveAction } from "@/app/actions/crew";
import { WorkerForm } from "@/components/dispatch/worker-form";
import { ActionButton } from "@/components/team/action-button";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, PageSkeleton } from "@/components/ui/card";
import { ActionsPanel, PageHeader } from "@/components/ui/page-header";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";

export const metadata: Metadata = { title: "Driver or loader" };

async function Worker({ params }: Pick<PageProps<"/b/[slug]/dispatch/crew/[id]">, "params">) {
  const { slug, id } = await params;
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);
  const { data: worker } = await supabase
    .from("dispatch_workers")
    .select("id, name, role, phone, is_active")
    .eq("organization_id", org.id)
    .eq("id", id)
    .maybeSingle();
  if (!worker) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title={worker.name}
        sub={worker.role === "driver" ? "Driver" : "Loader"}
        actions={worker.is_active ? null : <Badge tone="accent">Switched off</Badge>}
      />
      <Card>
        <WorkerForm
          action={saveWorkerAction.bind(null, org.slug, worker.id)}
          defaults={{ name: worker.name, role: worker.role, phone: worker.phone ?? "" }}
        />
      </Card>
      <ActionsPanel>
        <p className="text-sm font-medium text-ink-soft">
          {worker.is_active
            ? "Someone switched off is no longer offered when creating a trip. Past trips keep their name."
            : "Switch them back on to choose them for trips again."}
        </p>
        <ActionButton
          action={setWorkerActiveAction.bind(null, org.slug, worker.id, !worker.is_active)}
          label={worker.is_active ? "Switch off" : "Switch back on"}
          variant={worker.is_active ? "danger" : "secondary"}
          showSuccess
        />
      </ActionsPanel>
      <Link href={`/b/${org.slug}/dispatch/crew`} className={buttonClass("secondary")}>
        Back to drivers and loaders
      </Link>
    </div>
  );
}

export default function WorkerPage({ params }: PageProps<"/b/[slug]/dispatch/crew/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Worker params={params} />
    </Suspense>
  );
}
