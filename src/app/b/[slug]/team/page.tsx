import type { Metadata } from "next";
import { Suspense } from "react";
import {
  inviteMemberAction,
  revokeInvitationAction
} from "@/app/actions/team";
import { ActionButton } from "@/components/team/action-button";
import { InviteForm } from "@/components/team/invite-form";
import { Badge, Card, CardHeader, PageSkeleton, PageTitle } from "@/components/ui/card";
import { DataTable, TableCard } from "@/components/ui/data-table";
import { formatDate, ROLE_LABELS } from "@/lib/format";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Team" };

async function Team({ params }: Pick<PageProps<"/b/[slug]/team">, "params">) {
  const { slug } = await params;
  const { supabase, org, role, user } = await requireOrg(slug, MANAGER_ROLES);
  const isOwner = role === "owner";
  const now = new Date(await requestNow()).toISOString();

  const [membersResult, invitationsResult, planResult] = await Promise.all([
    supabase
      .from("memberships")
      .select("id, role, is_active, user_id, profiles (full_name, email)")
      .eq("organization_id", org.id)
      .order("created_at"),
    supabase
      .from("invitations")
      .select("id, email, role, expires_at")
      .eq("organization_id", org.id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", now)
      .order("created_at", { ascending: false }),
    supabase.from("plans").select("name, max_members").eq("code", org.plan_code).maybeSingle()
  ]);

  const members = membersResult.data ?? [];
  const invitations = invitationsResult.data ?? [];
  const seatsUsed = members.filter((member) => member.is_active).length + invitations.length;
  const seatLimit = planResult.data?.max_members ?? null;

  return (
    <div className="space-y-6">
      <PageTitle
        sub={
          seatLimit === null
            ? `${seatsUsed} team member${seatsUsed === 1 ? "" : "s"}, including open invitations.`
            : `${seatsUsed} of ${seatLimit} team members used on the ${planResult.data?.name} plan, including open invitations.`
        }
      >
        Team
      </PageTitle>

      <Card>
        <CardHeader
          title="Invite someone"
          description="They get a link to create their own login. Staff record the daily work; admins can also manage the team and settings."
        />
        <InviteForm
          action={inviteMemberAction.bind(null, org.slug)}
          businessName={org.name}
          canInviteAdmin={isOwner}
        />
      </Card>

      {invitations.length > 0 ? (
        <TableCard title="Open invitations">
          <DataTable
            label="Open invitations"
            rows={invitations}
            rowKey={(invitation) => invitation.id}
            columns={[
              { header: "Email", wrap: true, cell: (invitation) => <span className="font-semibold">{invitation.email}</span> },
              { header: "Role", phone: "badge", cell: (invitation) => <Badge>{ROLE_LABELS[invitation.role]}</Badge> },
              { header: "Expires", cell: (invitation) => formatDate(invitation.expires_at, org.timezone) },
              {
                header: "Cancel",
                align: "right",
                cell: (invitation) => (
                  <ActionButton
                    action={revokeInvitationAction.bind(null, org.slug, invitation.id)}
                    label="Cancel invitation"
                    pendingLabel="Cancelling…"
                    variant="danger"
                  />
                )
              }
            ]}
          />
        </TableCard>
      ) : null}

      <TableCard title="People">
        <DataTable
          label="People"
          rows={members}
          rowKey={(member) => member.id}
          rowHref={(member) =>
            member.user_id !== user.id && member.role !== "owner" && (isOwner || member.role === "staff")
              ? `/b/${org.slug}/team/${member.id}`
              : null
          }
          columns={[
            {
              header: "Name",
              wrap: true,
              cell: (member) => (
                <>
                  {member.profiles?.full_name || member.profiles?.email || "Unknown"}
                  {member.user_id === user.id ? <span className="font-normal text-ink-soft"> (you)</span> : null}
                </>
              )
            },
            {
              header: "Role",
              phone: "badge",
              cell: (member) => <Badge tone={member.role === "owner" ? "solid" : "plain"}>{ROLE_LABELS[member.role]}</Badge>
            },
            { header: "Email", cell: (member) => member.profiles?.email ?? "" },
            {
              header: "Access",
              cell: (member) => (member.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="accent">Access removed</Badge>)
            }
          ]}
        />
      </TableCard>
    </div>
  );
}

export default function TeamPage({ params }: PageProps<"/b/[slug]/team">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Team params={params} />
    </Suspense>
  );
}
