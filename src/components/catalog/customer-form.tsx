"use client";

import { FormMessage } from "@/components/ui/alert";
import { SelectField, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { useFormAction } from "@/lib/use-form-action";

type Props = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  defaults?: { name: string; phone: string; area: string; address: string; customerType?: string; buys?: string };
  /** A drinks business also records the customer's type and whether they buy RGB, PET or both. */
  drinks?: boolean;
};

export function CustomerForm({ action, defaults, drinks }: Props) {
  const { state, pending, form } = useFormAction(action);

  return (
    <form {...form} className="space-y-5">
      <TextField label="Customer name" name="name" defaultValue={defaults?.name} maxLength={80} required />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Phone (optional)"
          name="phone"
          type="tel"
          inputMode="tel"
          defaultValue={defaults?.phone}
          maxLength={30}
        />
        <TextField
          label="Area (optional)"
          name="area"
          defaultValue={defaults?.area}
          placeholder="e.g. Ikeja"
          maxLength={80}
        />
      </div>
      <TextField label="Address (optional)" name="address" defaultValue={defaults?.address} maxLength={200} />
      {drinks ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField label="Customer type (optional)" name="customerType" defaultValue={defaults?.customerType ?? ""}>
            <option value="">Not set</option>
            <option value="Retailer">Retailer</option>
            <option value="Wholesaler">Wholesaler</option>
            <option value="Distributor">Distributor</option>
          </SelectField>
          <SelectField label="Buys" name="buys" defaultValue={defaults?.buys ?? "both"}>
            <option value="both">RGB and PET</option>
            <option value="rgb">RGB only</option>
            <option value="pet">PET only</option>
          </SelectField>
        </div>
      ) : null}
      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save customer
      </SubmitButton>
    </form>
  );
}
