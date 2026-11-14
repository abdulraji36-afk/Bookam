"use client";

import { FormMessage } from "@/components/ui/alert";
import { CheckboxField, SelectField, TextField } from "@/components/ui/field";
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
  /** At sign-up, also ask what the business sells. */
  askFeatures?: boolean;
};

export function BusinessForm({ action, submitLabel, pendingLabel, defaults, askFeatures }: Props) {
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
      {askFeatures ? <FeatureQuestions /> : null}
      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingLabel={pendingLabel}>
        {submitLabel}
      </SubmitButton>
    </form>
  );
}

/** The two questions that decide which parts of BukAm a business sees. */
export function FeatureQuestions({ returns = false, serials = false }: { returns?: boolean; serials?: boolean }) {
  return (
    <fieldset className="space-y-4 rounded-md border-2 border-ink p-4">
      <legend className="px-1 text-lg font-extrabold">What do you sell?</legend>
      <CheckboxField
        label="Customers bring things back to me"
        name="tracksReturns"
        defaultChecked={returns}
        hint="Crates, gas cylinders, pallets, water bottles. BukAm tracks what each customer still owes you."
      />
      <CheckboxField
        label="I sell items with serial numbers"
        name="tracksSerials"
        defaultChecked={serials}
        hint="Phones, laptops, generators. Each one is recorded by its serial or IMEI when it comes in and when it is sold."
      />
      <p className="text-sm text-ink-soft">
        Leave both unticked if you simply sell goods. You can change this later in Settings.
      </p>
    </fieldset>
  );
}
