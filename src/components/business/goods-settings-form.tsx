"use client";

import { useState } from "react";
import { FormMessage } from "@/components/ui/alert";
import { CheckboxField, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { useFormAction } from "@/lib/use-form-action";

/** Settings for a goods depot: what comes back (and its name), and delivery. */
export function GoodsSettingsForm({
  action,
  returns,
  returnableName,
  delivery
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  returns: boolean;
  returnableName: string;
  delivery: boolean;
}) {
  const { state, pending, form } = useFormAction(action);
  const [comesBack, setComesBack] = useState(returns);

  return (
    <form {...form} className="space-y-4">
      <CheckboxField
        label="Customers bring things back to me"
        name="tracksReturns"
        checked={comesBack}
        onChange={(event) => setComesBack(event.currentTarget.checked)}
        hint="Gas cylinders, pallets, water bottles. Those goods are Returnable: BukAm tracks what each order still owes you."
      />
      {comesBack ? (
        <TextField
          label="What do they bring back?"
          name="returnableName"
          defaultValue={returns ? returnableName : ""}
          placeholder="e.g. Empty cylinders"
          maxLength={40}
          required
        />
      ) : null}
      <CheckboxField
        label="We deliver to customers"
        name="doesDelivery"
        defaultChecked={delivery}
        hint="Shows Dispatch, where you group orders onto trips for a driver. Leave it unticked if customers buy at your shop."
      />
      <FormMessage state={state} />
      <SubmitButton variant="secondary" pending={pending} pendingLabel="Saving…">
        Save
      </SubmitButton>
    </form>
  );
}
