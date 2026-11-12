import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { safeNextPath } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Log in" };

async function LoginCard({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const email = typeof params.email === "string" ? params.email : undefined;
  const signupHref = `/signup?next=${encodeURIComponent(next)}${email ? `&email=${encodeURIComponent(email)}` : ""}`;

  return (
    <>
      {params.error === "confirm" ? (
        <div className="mb-4">
          <Alert tone="error">
            That confirmation link has expired or was already used. Log in, or sign up again to get a
            new one.
          </Alert>
        </div>
      ) : null}
      <LoginForm next={next} email={email} />
      <p className="mt-5 text-sm text-slate-600">
        New to Bookam?{" "}
        <Link href={signupHref} className="font-medium text-brand-700 underline">
          Create an account
        </Link>
      </p>
    </>
  );
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Card>
      <h1 className="mb-5 text-xl font-semibold">Log in to Bookam</h1>
      <Suspense fallback={<div className="h-56 animate-pulse rounded-lg bg-slate-100" />}>
        <LoginCard searchParams={searchParams} />
      </Suspense>
    </Card>
  );
}
