import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ForgotPasswordForm } from "@/components/auth/password-forms";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Forgot your password?" };

async function ExpiredNotice({ searchParams }: Pick<PageProps<"/forgot-password">, "searchParams">) {
  const params = await searchParams;
  if (params.expired !== "1") return null;
  return (
    <div className="mb-4">
      <Alert tone="error">That reset link has expired or was already used. Ask for a new one below.</Alert>
    </div>
  );
}

export default function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  return (
    <Card>
      <h1 className="mb-2 text-2xl font-extrabold uppercase tracking-tight">Forgot your password?</h1>
      <p className="mb-5 text-ink-soft">Enter the email you log in with. We will send you a link to choose a new one.</p>
      <Suspense fallback={null}>
        <ExpiredNotice searchParams={searchParams} />
      </Suspense>
      <ForgotPasswordForm />
      <p className="mt-5 text-sm text-ink-soft">
        Remembered it?{" "}
        <Link href="/login" className="font-extrabold text-ink underline decoration-accent decoration-2 underline-offset-4">
          Log in
        </Link>
      </p>
    </Card>
  );
}
