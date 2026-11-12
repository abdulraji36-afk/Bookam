"use client";

import { FormMessage } from "@/components/ui/alert";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { useFormAction } from "@/lib/use-form-action";

export function LocationForm({
  action
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const { state, pending, form } = useFormAction(action, { resetOnSuccess: true });

  return (
    <form {...form} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <TextField
          label="New location name"
          name="name"
          placeholder="e.g. Ikeja warehouse"
          maxLength={80}
          required
        />
        <SubmitButton variant="secondary" pending={pending} pendingLabel="Adding…">
          Add location
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
