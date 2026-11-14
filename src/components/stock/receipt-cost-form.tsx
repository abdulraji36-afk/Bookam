"use client";

import { FormMessage } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { useFormAction } from "@/lib/use-form-action";

/** The buying cost on one delivery line, which owners and admins can correct. */
export function ReceiptCostForm({
  action,
  cost,
  label
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  cost: number | null;
  label: string;
}) {
  const { state, pending, form } = useFormAction(action);
  return (
    <form {...form} className="flex basis-full flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-2 font-bold text-ink-soft">
        {label}
        <input
          name="unitCost"
          inputMode="decimal"
          defaultValue={cost === null ? "" : String(cost)}
          className="min-h-10 w-32 rounded-md border-2 border-field bg-white px-2 font-semibold tabular-nums text-ink focus:border-ink focus:outline-2 focus:outline-accent"
        />
      </label>
      <SubmitButton variant="secondary" size="sm" pending={pending} pendingLabel="Saving…">
        Save cost
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
