import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { setMemberActiveAction, setMemberRoleAction } from "@/app/actions/team";
import { RecordDetails } from "@/components/returns/record-details";
import { ActionButton } from "@/components/team/action-button";
import { RoleSelect } from "@/components/team/role-select";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, PageSkeleton } from "@/components/ui/card";
import { ActionsPanel, PageHeader } from "@/components/ui/page-header";
import { ROLE_LABELS } from "@/lib/format";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";

export const metadata: Metadata = { title: "Team member" };

async function Member({ params }: Pick<PageProps<"/b/[slug]/team/[memberId]">, "params">) {
  const { slug, memberId } = await params;
  const { supabase, org, role, user } = await requireOrg(slug, MANAGER_ROLES);
  const { data: member } = await supabase
    .from("memberships")
    .select("id, role, is_active, user_id, created_at, profiles (full_name, email)")
    .eq("organization_id", org.id)
    .eq("id", memberId)
    .maybeSingle();
  if (!member) notFound();

  const isOwner = role === "owner";
  const name = member.profiles?.full_name || member.profiles?.email || "Unknown";
  const canChangeAccess = member.user_id !== user.id && member.role !== "owner" && (isOwner || member.role === "staff");
  const canChangeRole = isOwner && member.role !== "owner" && member.is_active;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title={name}
        sub={member.profiles?.email}
        actions={member.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="accent">Access removed</Badge>}
      />
      <Card>
        <RecordDetails details={[["Role", ROLE_LABELS[member.role]], ["Email", member.profiles?.email]]} />
      </Card>
      {canChangeRole || canChangeAccess ? (
        <ActionsPanel>
          {canChangeRole ? (
            <div className="space-y-1">
              <p className="text-sm font-bold">Role</p>
              <RoleSelect
                action={setMemberRoleAction.bind(null, org.slug, member.id)}
                role={member.role === "admin" ? "admin" : "staff"}
                memberName={name}
              />
            </div>
          ) : null}
          {canChangeAccess ? (
            member.is_active ? (
              <ActionButton
                action={setMemberActiveAction.bind(null, org.slug, member.id, false)}
                label="Remove access"
                pendingLabel="Removing…"
                variant="danger"
                confirmMessage={`Remove ${name}'s access to ${org.name}? They will be logged out of this business straight away.`}
              />
            ) : (
              <ActionButton
                action={setMemberActiveAction.bind(null, org.slug, member.id, true)}
                label="Restore access"
                pendingLabel="Restoring…"
              />
            )
          ) : null}
        </ActionsPanel>
      ) : null}
      <Link href={`/b/${org.slug}/team`} className={buttonClass("secondary")}>
        Back to team
      </Link>
    </div>
  );
}

export default function MemberPage({ params }: PageProps<"/b/[slug]/team/[memberId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Member params={params} />
    </Suspense>
  );
}
