"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent } from "react";
import type { ActionState } from "@/lib/action-state";

type FormAction<T> = (previous: ActionState<T>, formData: FormData) => Promise<ActionState<T>>;

/**
 * useActionState for forms, without React's default of clearing every field
 * after each submit. What the person typed stays put when there is an error;
 * pass resetOnSuccess to clear the form once the action succeeds.
 *
 * Spread `form` onto the <form>. It still works before JavaScript loads.
 */
export function useFormAction<T = undefined>(
  action: FormAction<T>,
  options: { resetOnSuccess?: boolean } = {}
) {
  const initial: ActionState<T> = { ok: false, message: "" };
  const [state, dispatch, pending] = useActionState(action, initial);
  const ref = useRef<HTMLFormElement>(null);
  const { resetOnSuccess = false } = options;

  useEffect(() => {
    if (resetOnSuccess && state.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  }

  return { state, pending, form: { ref, action: dispatch, onSubmit } };
}
