import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignupForm } from "@/components/auth/signup-form";
import { Card } from "@/components/ui/card";
import { safeNextPath } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Create your account" };

async function SignupCard({ searchParams }: Pick<PageProps<"/signup">, "searchParams">) {
  const params = await searchParams;
  const next = safeNextPath(params.next, "/onboarding");
  const email = typeof params.email === "string" ? params.email : undefined;
  const loginHref = `/login?next=${encodeURIComponent(next)}${email ? `&email=${encodeURIComponent(email)}` : ""}`;

  return (
    <>
      <SignupForm next={next} email={email} />
      <p className="mt-5 text-sm text-slate-600">
        Already have an account?{" "}
        <Link href={loginHref} className="font-medium text-brand-700 underline">
          Log in
        </Link>
      </p>
    </>
  );
}

export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  return (
    <Card>
      <h1 className="text-xl font-semibold">Create your account</h1>
      <p className="mb-5 mt-1 text-sm text-slate-600">Free for 14 days. No card needed.</p>
      <Suspense fallback={<div className="h-72 animate-pulse rounded-lg bg-slate-100" />}>
        <SignupCard searchParams={searchParams} />
      </Suspense>
    </Card>
  );
}
