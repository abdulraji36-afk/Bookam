"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { idleState, type ActionState } from "@/lib/action-state";

export function AcceptInviteForm({
  action
}: {
  action: (previous: ActionState) => Promise<ActionState>;
}) {
  const [state, formAction] = useActionState(action, idleState);

  return (
    <form action={formAction} className="space-y-3">
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingLabel="Joining…">
        Accept invitation
      </SubmitButton>
    </form>
  );
}
