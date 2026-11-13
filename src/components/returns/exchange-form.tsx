"use client";

import { FormMessage } from "@/components/ui/alert";
import { SelectField, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { useFormAction } from "@/lib/use-form-action";

export type Choice = { id: string; name: string };

type Props = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  returnables: Choice[];
  locations: Choice[];
  today: string;
};

export function ExchangeForm({ action, returnables, locations, today }: Props) {
  const { state, pending, form } = useFormAction(action);

  return (
    <form {...form} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        {returnables.length > 1 ? (
          <SelectField label="What did the supplier take?" name="returnableItemId" defaultValue={returnables[0].id}>
            {returnables.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <input type="hidden" name="returnableItemId" value={returnables[0]?.id ?? ""} />
        )}
        <TextField
          label={returnables.length > 1 ? "How many?" : `How many ${returnables[0]?.name ?? ""} did the supplier take?`}
          name="quantity"
          inputMode="decimal"
          autoComplete="off"
          required
        />
        <TextField label="Date" name="exchangeDate" type="date" defaultValue={today} max={today} required />
        {locations.length > 1 ? (
          <SelectField label="Taken from" name="locationId" defaultValue={locations[0].id}>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <input type="hidden" name="locationId" value={locations[0]?.id ?? ""} />
        )}
        <TextField label="Supplier (optional)" name="supplierName" maxLength={80} />
        <TextField label="Delivery reference (optional)" name="reference" maxLength={80} />
        <TextField label="Handed over by (optional)" name="receivedBy" maxLength={80} />
      </div>
      <TextField label="Note (optional)" name="note" maxLength={500} />
      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save exchange
      </SubmitButton>
    </form>
  );
}
