"use client";

import Link from "next/link";
import { signInAction } from "@/app/actions/auth";
import { FormMessage } from "@/components/ui/alert";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormAction } from "@/lib/use-form-action";

export function LoginForm({ next, email }: { next: string; email?: string }) {
  const { state, pending, form } = useFormAction(signInAction);

  return (
    <form {...form} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        defaultValue={email}
        required
      />
      <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
      <p className="-mt-2 text-right text-sm">
        <Link
          href="/forgot-password"
          className="font-bold text-ink underline decoration-accent decoration-2 underline-offset-4"
        >
          Forgot your password?
        </Link>
      </p>
      <FormMessage state={state} />
      <SubmitButton className="w-full" pending={pending} pendingLabel="Logging in…">
        Log in
      </SubmitButton>
    </form>
  );
}
