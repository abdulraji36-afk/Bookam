"use client";

import { FormMessage } from "@/components/ui/alert";
import { SelectField, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { useFormAction } from "@/lib/use-form-action";

export function WorkerForm({ action }: { action: (previous: ActionState, formData: FormData) => Promise<ActionState> }) {
  const { state, pending, form } = useFormAction(action, { resetOnSuccess: true });
  return (
    <form {...form} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Name" name="name" autoComplete="off" maxLength={80} required />
        <SelectField label="Driver or loader?" name="role" defaultValue="driver">
          <option value="driver">Driver</option>
          <option value="loader">Loader</option>
        </SelectField>
        <TextField label="Phone (optional)" name="phone" inputMode="tel" autoComplete="off" maxLength={30} />
      </div>
      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingLabel="Adding…">
        Add to the list
      </SubmitButton>
    </form>
  );
}
