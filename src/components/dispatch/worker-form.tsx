"use client";

import { FormMessage } from "@/components/ui/alert";
import { SelectField, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { useFormAction } from "@/lib/use-form-action";

export function WorkerForm({
  action,
  defaults
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  /** Set when changing someone already on the list. */
  defaults?: { name: string; role: "driver" | "loader"; phone: string };
}) {
  const { state, pending, form } = useFormAction(action, { resetOnSuccess: !defaults });
  return (
    <form {...form} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Name" name="name" autoComplete="off" maxLength={80} defaultValue={defaults?.name} required />
        <SelectField label="Driver or loader?" name="role" defaultValue={defaults?.role ?? "driver"}>
          <option value="driver">Driver</option>
          <option value="loader">Loader</option>
        </SelectField>
        <TextField
          label="Phone (optional)"
          name="phone"
          inputMode="tel"
          autoComplete="off"
          maxLength={30}
          defaultValue={defaults?.phone}
        />
      </div>
      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        {defaults ? "Save changes" : "Add to the list"}
      </SubmitButton>
    </form>
  );
}
