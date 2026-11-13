"use client";

import { FormMessage } from "@/components/ui/alert";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { useFormAction } from "@/lib/use-form-action";

type Props = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  /** The collapsed label, e.g. "Void this order". */
  trigger: string;
  /** What will happen, shown once opened. */
  explanation: string;
  submitLabel: string;
  /** Set for a correction, to ask for the right figure as well as a reason. */
  quantity?: { label: string; current: number };
  compact?: boolean;
};

/**
 * A fold-out form for undoing or correcting something. It always asks for a
 * reason, and stays closed until the person deliberately opens it.
 */
export function ReasonForm({ action, trigger, explanation, submitLabel, quantity, compact }: Props) {
  const { state, pending, form } = useFormAction(action);

  return (
    <details className={compact ? "w-full" : "w-full rounded-md border-2 border-danger bg-white"}>
      <summary
        className={`cursor-pointer select-none font-extrabold uppercase tracking-wide text-danger ${
          compact ? "text-sm underline underline-offset-4" : "px-4 py-3"
        }`}
      >
        {trigger}
      </summary>
      <form {...form} className={`space-y-4 ${compact ? "mt-3 rounded-md border-2 border-danger p-4" : "border-t-2 border-danger p-4"}`}>
        <p className="text-sm font-medium text-ink-soft">{explanation}</p>
        {quantity ? (
          <TextField
            label={quantity.label}
            name="quantity"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={String(quantity.current)}
            required
          />
        ) : null}
        <TextField label="Reason" name="reason" maxLength={500} placeholder="Why is this being changed?" required />
        <FormMessage state={state} />
        <SubmitButton variant="danger" size="sm" pending={pending} pendingLabel="Saving…">
          {submitLabel}
        </SubmitButton>
      </form>
    </details>
  );
}
