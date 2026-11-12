"use client";

import { useId, useState } from "react";
import { FormMessage } from "@/components/ui/alert";
import { CheckboxField, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { useFormAction } from "@/lib/use-form-action";

const UNITS = ["crate", "pack", "carton", "bag", "cylinder", "bottle", "piece"];

export type ProductDefaults = {
  name: string;
  sku: string;
  unit: string;
  sellingPrice: string;
  costPrice: string;
  lowStock: string;
  returnItemName: string;
};

type Props = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  currency: string;
  /** Things customers already bring back for other products. */
  returnables: string[];
  defaults?: ProductDefaults;
};

export function ProductForm({ action, currency, returnables, defaults }: Props) {
  const { state, pending, form } = useFormAction(action);
  const [requiresReturn, setRequiresReturn] = useState(Boolean(defaults?.returnItemName));
  const unitListId = useId();
  const returnListId = useId();

  return (
    <form {...form} className="space-y-5">
      <TextField label="Product name" name="name" defaultValue={defaults?.name} maxLength={80} required />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Sold by the"
          name="unit"
          list={unitListId}
          defaultValue={defaults?.unit ?? "crate"}
          hint="The unit you count this product in."
          maxLength={30}
          required
        />
        <TextField
          label="Product code (optional)"
          name="sku"
          defaultValue={defaults?.sku}
          maxLength={40}
        />
        <TextField
          label={`Selling price (${currency})`}
          name="sellingPrice"
          inputMode="decimal"
          defaultValue={defaults?.sellingPrice}
          hint="Per unit. Leave empty to set it later."
        />
        <TextField
          label={`Buying cost (${currency})`}
          name="costPrice"
          inputMode="decimal"
          defaultValue={defaults?.costPrice}
          hint="Only owners and admins can see this."
        />
        <TextField
          label="Warn me when stock falls to"
          name="lowStock"
          inputMode="decimal"
          defaultValue={defaults?.lowStock}
          hint="Leave empty for no warning."
        />
      </div>
      <datalist id={unitListId}>
        {UNITS.map((unit) => (
          <option key={unit} value={unit} />
        ))}
      </datalist>

      <div className="space-y-4 rounded-md border-2 border-ink p-4">
        <CheckboxField
          label="Customers must bring something back"
          name="requiresReturn"
          checked={requiresReturn}
          onChange={(event) => setRequiresReturn(event.currentTarget.checked)}
          hint="Tick this for goods sold in a crate, cylinder or other container you need returned. Leave it off for goods that are simply sold."
        />
        {requiresReturn ? (
          <>
            <TextField
              label="What must they bring back?"
              name="returnItemName"
              list={returnListId}
              defaultValue={defaults?.returnItemName}
              placeholder="e.g. Empty crate"
              maxLength={60}
              required
            />
            <datalist id={returnListId}>
              {returnables.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </>
        ) : null}
      </div>

      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save product
      </SubmitButton>
    </form>
  );
}
