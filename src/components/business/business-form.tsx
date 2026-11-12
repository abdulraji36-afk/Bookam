"use client";

import { FormMessage } from "@/components/ui/alert";
import { SelectField, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { useFormAction } from "@/lib/use-form-action";

export const BUSINESS_TYPES = [
  "Drinks depot",
  "Gas depot",
  "Water depot",
  "Building materials",
  "Warehouse",
  "Shop",
  "Other"
];

type Props = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  pendingLabel: string;
  defaults?: { name: string; businessType: string | null };
};

export function BusinessForm({ action, submitLabel, pendingLabel, defaults }: Props) {
  const { state, pending, form } = useFormAction(action);
  const types =
    defaults?.businessType && !BUSINESS_TYPES.includes(defaults.businessType)
      ? [defaults.businessType, ...BUSINESS_TYPES]
      : BUSINESS_TYPES;

  return (
    <form {...form} className="space-y-4">
      <TextField
        label="Business name"
        name="name"
        defaultValue={defaults?.name}
        placeholder="e.g. Bilikis Store"
        maxLength={80}
        required
      />
      <SelectField label="What kind of business is it?" name="businessType" defaultValue={defaults?.businessType ?? ""}>
        <option value="">Choose one (optional)</option>
        {types.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </SelectField>
      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingLabel={pendingLabel}>
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
