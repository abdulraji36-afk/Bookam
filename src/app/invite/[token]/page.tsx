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
        <h1 className="text-2xl font-extrabold uppercase tracking-tight">Join {invitation.organization_name}</h1>
        <p className="mt-1 text-sm text-ink-soft">
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
    <>
      <header className="bg-ink px-4 py-4">
        <div className="mx-auto w-full max-w-md">
          <Logo tone="light" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
        <Card>
          <Suspense fallback={<div className="h-40 animate-pulse rounded-md bg-chip" />}>
            <Invitation params={params} />
          </Suspense>
        </Card>
      </main>
    </>
  );
}
