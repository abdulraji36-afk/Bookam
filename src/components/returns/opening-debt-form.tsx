"use client";

import type { Choice } from "@/components/returns/exchange-form";
import { FormMessage } from "@/components/ui/alert";
import { SelectField, TextField } from "@/components/ui/field";
import { SearchSelect } from "@/components/ui/search-select";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { useFormAction } from "@/lib/use-form-action";

type Props = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  returnables: Choice[];
  customers: Choice[];
};

export function OpeningDebtForm({ action, returnables, customers }: Props) {
  const { state, pending, form } = useFormAction(action, { resetOnSuccess: true });

  return (
    <form {...form} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <SearchSelect
          label="Customer"
          name="customerId"
          placeholder="Type a name to search"
          options={customers.map((customer) => ({ value: customer.id, label: customer.name }))}
        />
        {returnables.length > 1 ? (
          <SelectField label="What do they owe?" name="returnableItemId" defaultValue={returnables[0].id}>
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
          label={returnables.length > 1 ? "How many?" : `How many ${returnables[0]?.name ?? ""} do they owe?`}
          name="quantity"
          inputMode="decimal"
          autoComplete="off"
          required
        />
      </div>
      <TextField label="Note (optional)" name="note" maxLength={500} />
      <FormMessage state={state} />
      <SubmitButton variant="secondary" pending={pending} pendingLabel="Saving…">
        Record old debt
      </SubmitButton>
    </form>
  );
}
