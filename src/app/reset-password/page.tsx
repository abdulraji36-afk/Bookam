import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { NewPasswordForm } from "@/components/auth/password-forms";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Choose a new password" };

async function ResetPassword() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <>
        <h1 className="mb-2 text-2xl font-extrabold uppercase tracking-tight">Link expired</h1>
        <p className="mb-5 text-ink-soft">
          This reset link has expired or was opened in a different browser. Ask for a new one and open it in the
          browser you asked from.
        </p>
        <Link
          href="/forgot-password"
          className="font-extrabold text-ink underline decoration-accent decoration-4 underline-offset-4"
        >
          Send me a new link
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="mb-2 text-2xl font-extrabold uppercase tracking-tight">Choose a new password</h1>
      <p className="mb-5 text-ink-soft">For {user.email ?? "your account"}.</p>
      <NewPasswordForm />
    </>
  );
}

// Lives outside the (auth) group: someone arriving from a reset link is
// already signed in, and that group sends signed-in visitors away.
export default function ResetPasswordPage() {
  return (
    <>
      <header className="bg-ink px-4 py-4">
        <div className="mx-auto w-full max-w-md">
          <Logo tone="light" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
        <Card>
          <Suspense fallback={<div className="h-56 animate-pulse rounded-md bg-chip" />}>
            <ResetPassword />
          </Suspense>
        </Card>
      </main>
    </>
  );
}
