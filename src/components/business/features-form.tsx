"use client";

import { FeatureQuestions } from "@/components/business/business-form";
import { FormMessage } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { useFormAction } from "@/lib/use-form-action";

export function FeaturesForm({
  action,
  returns,
  serials
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  returns: boolean;
  serials: boolean;
}) {
  const { state, pending, form } = useFormAction(action);

  return (
    <form {...form} className="space-y-4">
      <FeatureQuestions returns={returns} serials={serials} />
      <FormMessage state={state} />
      <SubmitButton variant="secondary" pending={pending} pendingLabel="Saving…">
        Save
      </SubmitButton>
    </form>
  );
}
