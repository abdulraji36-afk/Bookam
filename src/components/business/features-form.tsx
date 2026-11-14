"use client";

import { SellingQuestions } from "@/components/business/business-form";
import { FormMessage } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { useFormAction } from "@/lib/use-form-action";
import type { SellingMode } from "@/types/database";

export function FeaturesForm({
  action,
  mode,
  returns,
  serials,
  delivery,
  drinks
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  mode: SellingMode;
  returns: boolean;
  serials: boolean;
  delivery: boolean;
  drinks: boolean;
}) {
  const { state, pending, form } = useFormAction(action);

  return (
    <form {...form} className="space-y-4">
      <SellingQuestions mode={mode} returns={returns} serials={serials} delivery={delivery} drinks={drinks} />
      <FormMessage state={state} />
      <SubmitButton variant="secondary" pending={pending} pendingLabel="Saving…">
        Save
      </SubmitButton>
    </form>
  );
}
