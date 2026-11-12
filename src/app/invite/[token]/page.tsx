import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { acceptInvitationAction } from "@/app/actions/team";
import { Logo } from "@/components/logo";
import { AcceptInviteForm } from "@/components/team/accept-invite-form";
import { Alert } from "@/components/ui/alert";
import { LogoutButton } from "@/components/logout-button";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Join a business", robots: { index: false } };

const CLOSED_MESSAGES = {
  accepted: "This invitation has already been used. Log in to open the business.",
  revoked: "This invitation was cancelled. Ask the person who invited you for a new link.",
  expired: "This invitation has expired. Ask the person who invited you for a new link."
};

async function Invitation({ params }: Pick<PageProps<"/invite/[token]">, "params">) {
  const { token } = await params;
  const supabase = await createClient();
  const [{ data }, user] = await Promise.all([
    supabase.rpc("get_invitation_preview", { p_token: token }),
    getCurrentUser()
  ]);
  const invitation = data?.[0];

  if (!invitation) {
    return <Alert tone="error">This invitation link is not valid. Check that you copied all of it.</Alert>;
  }

  if (invitation.status !== "pending") {
    return (
      <div className="space-y-4">
        <Alert tone="info">{CLOSED_MESSAGES[invitation.status]}</Alert>
        <Link href="/login" className={buttonClass("secondary")}>
          Log in
        </Link>
      </div>
    );
  }

  const query = `next=${encodeURIComponent(`/invite/${token}`)}&email=${encodeURIComponent(invitation.email)}`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Join {invitation.organization_name}</h1>
        <p className="mt-1 text-sm text-slate-600">
          You have been invited as <strong>{ROLE_LABELS[invitation.role]}</strong>, using the email{" "}
          <strong>{invitation.email}</strong>.
        </p>
      </div>

      {!user ? (
        <div className="space-y-3">
          <Link href={`/signup?${query}`} className={`${buttonClass("primary")} w-full`}>
            Create an account to join
          </Link>
          <Link href={`/login?${query}`} className={`${buttonClass("secondary")} w-full`}>
            I already have an account
          </Link>
        </div>
      ) : user.email === invitation.email ? (
        <AcceptInviteForm action={acceptInvitationAction.bind(null, token)} />
      ) : (
        <div className="space-y-3">
          <Alert tone="error">
            You are logged in as {user.email}, but this invitation is for {invitation.email}. Log out
            and come back to this link with the right account.
          </Alert>
          <LogoutButton variant="secondary" />
        </div>
      )}
    </div>
  );
}

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <div className="mb-6">
        <Logo />
      </div>
      <Card>
        <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-slate-100" />}>
          <Invitation params={params} />
        </Suspense>
      </Card>
    </main>
  );
}
