"use client";

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
      <FormMessage state={state} />
      <SubmitButton className="w-full" pending={pending} pendingLabel="Logging in…">
        Log in
      </SubmitButton>
    </form>
  );
}
