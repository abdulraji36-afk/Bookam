"use client";

import { requestPasswordResetAction, setNewPasswordAction } from "@/app/actions/auth";
import { FormMessage } from "@/components/ui/alert";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormAction } from "@/lib/use-form-action";

export function ForgotPasswordForm() {
  const { state, pending, form } = useFormAction(requestPasswordResetAction);

  return (
    <form {...form} className="space-y-4">
      <TextField label="Email" name="email" type="email" autoComplete="email" inputMode="email" required />
      <FormMessage state={state} />
      <SubmitButton className="w-full" pending={pending} pendingLabel="Sending…">
        Send reset link
      </SubmitButton>
    </form>
  );
}

export function NewPasswordForm() {
  const { state, pending, form } = useFormAction(setNewPasswordAction);

  return (
    <form {...form} className="space-y-4">
      <TextField
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters."
        minLength={8}
        required
      />
      <TextField label="Type it again" name="confirm" type="password" autoComplete="new-password" required />
      <FormMessage state={state} />
      <SubmitButton className="w-full" pending={pending} pendingLabel="Saving…">
        Save new password
      </SubmitButton>
    </form>
  );
}
