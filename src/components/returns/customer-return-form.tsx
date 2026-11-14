"use client";

import type { Choice } from "@/components/returns/exchange-form";
import { FormMessage } from "@/components/ui/alert";
import { SelectField, TextField } from "@/components/ui/field";
import { SearchSelect } from "@/components/ui/search-select";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { formatQuantity } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";

type Props = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  returnable: Choice;
  locations: Choice[];
  /** Customers who still owe, with how many. */
  owing: { id: string; name: string; owed: number }[];
  today: string;
};

/** A customer brings back empties they still owed, at the depot. */
export function CustomerReturnForm({ action, returnable, locations, owing, today }: Props) {
  const { state, pending, form } = useFormAction(action);
  const word = returnable.name.toLowerCase();

  return (
    <form {...form} className="space-y-5">
      <input type="hidden" name="returnableItemId" value={returnable.id} />
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <SearchSelect
            label="Customer"
            name="customerId"
            placeholder="Type a name to search"
            options={owing.map((customer) => ({
              value: customer.id,
              label: customer.name,
              detail: `owes ${formatQuantity(customer.owed)}`
            }))}
          />
        </div>
        <TextField
          label={`How many ${word} did they bring?`}
          name="quantity"
          inputMode="numeric"
          autoComplete="off"
          required
        />
        <TextField label="Date" name="returnDate" type="date" defaultValue={today} max={today} required />
        {locations.length > 1 ? (
          <SelectField label="Brought to" name="locationId" defaultValue={locations[0].id}>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <input type="hidden" name="locationId" value={locations[0]?.id ?? ""} />
        )}
      </div>
      <TextField label="Note (optional)" name="note" maxLength={500} />
      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save
      </SubmitButton>
    </form>
  );
}
