import type { Metadata } from "next";
import { Suspense } from "react";
import {
  inviteMemberAction,
  revokeInvitationAction,
  setMemberActiveAction,
  setMemberRoleAction
} from "@/app/actions/team";
import { ActionButton } from "@/components/team/action-button";
import { InviteForm } from "@/components/team/invite-form";
import { RoleSelect } from "@/components/team/role-select";
import { Badge, Card, CardHeader, PageSkeleton } from "@/components/ui/card";
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
      <div>
        <h1 className="text-2xl font-semibold">Team</h1>
        <p className="mt-1 text-sm text-slate-600">
          {seatLimit === null
            ? `${seatsUsed} team member${seatsUsed === 1 ? "" : "s"}, including open invitations.`
            : `${seatsUsed} of ${seatLimit} team members used on the ${planResult.data?.name} plan, including open invitations.`}
        </p>
      </div>

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
        <Card>
          <CardHeader title="Open invitations" />
          <ul className="divide-y divide-slate-100">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{invitation.email}</p>
                  <p className="text-sm text-slate-600">
                    {ROLE_LABELS[invitation.role]} · expires {formatDate(invitation.expires_at, org.timezone)}
                  </p>
                </div>
                <ActionButton
                  action={revokeInvitationAction.bind(null, org.slug, invitation.id)}
                  label="Cancel"
                  pendingLabel="Cancelling…"
                  variant="danger"
                />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="People" />
        <ul className="divide-y divide-slate-100">
          {members.map((member) => {
            const name = member.profiles?.full_name || member.profiles?.email || "Unknown";
            const isSelf = member.user_id === user.id;
            const canChangeAccess =
              !isSelf && member.role !== "owner" && (isOwner || member.role === "staff");

            return (
              <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {name}
                    {isSelf ? <span className="font-normal text-slate-500"> (you)</span> : null}
                  </p>
                  <p className="truncate text-sm text-slate-600">{member.profiles?.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!member.is_active ? <Badge tone="amber">Access removed</Badge> : null}
                  {isOwner && member.role !== "owner" && member.is_active ? (
                    <RoleSelect
                      action={setMemberRoleAction.bind(null, org.slug, member.id)}
                      role={member.role}
                      memberName={name}
                    />
                  ) : (
                    <Badge tone={member.role === "owner" ? "green" : "slate"}>
                      {ROLE_LABELS[member.role]}
                    </Badge>
                  )}
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
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
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
