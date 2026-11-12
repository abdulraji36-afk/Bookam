"use client";

import { signUpAction } from "@/app/actions/auth";
import { Alert, FormMessage } from "@/components/ui/alert";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormAction } from "@/lib/use-form-action";

export function SignupForm({ next, email }: { next: string; email?: string }) {
  const { state, pending, form } = useFormAction(signUpAction);

  if (state.ok && state.data?.emailSent) {
    return <Alert tone="success">{state.message}</Alert>;
  }

  return (
    <form {...form} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <TextField label="Your full name" name="fullName" autoComplete="name" required />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        defaultValue={email}
        required
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        hint="At least 8 characters."
        required
      />
      <FormMessage state={state} />
      <SubmitButton className="w-full" pending={pending} pendingLabel="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}
