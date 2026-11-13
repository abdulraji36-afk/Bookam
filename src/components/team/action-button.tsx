"use client";

import { useActionState, useRef } from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { idleState, type ActionState } from "@/lib/action-state";

type Props = {
  action: (previous: ActionState) => Promise<ActionState>;
  label: string;
  pendingLabel?: string;
  variant?: ButtonVariant;
  size?: "md" | "sm";
  /** When set, the person must confirm in a dialog before the action runs. */
  confirmMessage?: string;
  /** Also show the message when the action succeeds. */
  showSuccess?: boolean;
};

/** A single button that runs a server action and shows any error beside it. */
export function ActionButton({
  action,
  label,
  pendingLabel = "Please wait…",
  variant = "secondary",
  size = "sm",
  confirmMessage,
  showSuccess
}: Props) {
  const [state, formAction, pending] = useActionState(action, idleState);
  const form = useRef<HTMLFormElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <form ref={form} action={formAction} className="flex flex-col items-end gap-1">
      <Button
        // With a confirmation, the first press only opens the dialog.
        type={confirmMessage ? "button" : "submit"}
        variant={variant}
        size={size}
        disabled={pending}
        onClick={confirmMessage ? () => dialog.current?.showModal() : undefined}
      >
        {pending ? pendingLabel : label}
      </Button>

      {confirmMessage ? (
        <dialog
          ref={dialog}
          aria-label={label}
          onClick={(event) => {
            if (event.target === event.currentTarget) dialog.current?.close();
          }}
          className="m-auto w-[min(92vw,26rem)] rounded-md bg-white p-0 text-left text-ink shadow-xl open:animate-pop-in"
        >
          <div className="space-y-5 p-5">
            <p className="text-lg font-extrabold">{label}?</p>
            <p className="font-medium text-ink-soft">{confirmMessage}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => dialog.current?.close()}>
                Go back
              </Button>
              <Button
                type="button"
                variant={variant === "danger" ? "danger" : "primary"}
                size="sm"
                onClick={() => {
                  dialog.current?.close();
                  form.current?.requestSubmit();
                }}
              >
                Yes, {label.charAt(0).toLowerCase() + label.slice(1)}
              </Button>
            </div>
          </div>
        </dialog>
      ) : null}

      {!state.ok && state.message ? (
        <p role="alert" className="max-w-56 text-right text-xs text-danger">
          {state.message}
        </p>
      ) : null}
      {showSuccess && state.ok && state.message ? (
        <p role="status" className="max-w-56 text-right text-xs font-semibold text-success">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
