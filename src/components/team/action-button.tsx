"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { idleState, type ActionState } from "@/lib/action-state";

type Props = {
  action: (previous: ActionState) => Promise<ActionState>;
  label: string;
  pendingLabel?: string;
  variant?: "secondary" | "danger";
  /** When set, the person must confirm before the action runs. */
  confirmMessage?: string;
};

/** A single button that runs a server action and shows any error beside it. */
export function ActionButton({ action, label, pendingLabel, variant = "secondary", confirmMessage }: Props) {
  const [state, formAction] = useActionState(action, idleState);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
      className="flex flex-col items-end gap-1"
    >
      <SubmitButton variant={variant} size="sm" pendingLabel={pendingLabel}>
        {label}
      </SubmitButton>
      {!state.ok && state.message ? (
        <p role="alert" className="max-w-56 text-right text-xs text-danger">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
