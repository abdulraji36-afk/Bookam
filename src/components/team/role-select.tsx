"use client";

import { useActionState } from "react";
import { idleState, type ActionState } from "@/lib/action-state";

type Props = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  role: "admin" | "staff";
  memberName: string;
};

export function RoleSelect({ action, role, memberName }: Props) {
  const [state, formAction, pending] = useActionState(action, idleState);

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <select
        // Remount when the saved role changes so the control always shows it.
        key={role}
        name="role"
        defaultValue={role}
        disabled={pending}
        aria-label={`Role for ${memberName}`}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="min-h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm"
      >
        <option value="admin">Admin</option>
        <option value="staff">Staff</option>
      </select>
      {!state.ok && state.message ? (
        <p role="alert" className="text-xs text-red-700">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
