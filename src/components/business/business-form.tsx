"use client";

import { useState } from "react";
import { FormMessage } from "@/components/ui/alert";
import { CheckboxField, SelectField, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { SELLING_MODES } from "@/lib/selling";
import { useFormAction } from "@/lib/use-form-action";
import type { SellingMode } from "@/types/database";

export const BUSINESS_TYPES = [
  "Drinks depot",
  "Gas depot",
  "Water depot",
  "Building materials",
  "Warehouse",
  "Phone and gadget shop",
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
      {askFeatures ? <SellingQuestions /> : null}
      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingLabel={pendingLabel}>
        {submitLabel}
      </SubmitButton>
    </form>
  );
}

type SellingDefaults = {
  mode?: SellingMode;
  returns?: boolean;
  serials?: boolean;
  delivery?: boolean;
  drinks?: boolean;
};

/**
 * The questions that decide which parts of BukAm a business sees: first how
 * it sells, then the follow-ups that fit that answer.
 */
export function SellingQuestions({
  mode: initialMode,
  returns = false,
  serials = false,
  delivery,
  drinks = false
}: SellingDefaults) {
  const [mode, setMode] = useState<SellingMode | null>(initialMode ?? null);
  // Until the person answers it themselves, delivery follows the usual case:
  // depots deliver, phone shops sell at the counter.
  const [deliveryTouched, setDeliveryTouched] = useState(delivery !== undefined);
  const [delivers, setDelivers] = useState(delivery ?? true);

  function choose(next: SellingMode) {
    setMode(next);
    if (!deliveryTouched) setDelivers(next === "quantity");
  }

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-lg font-extrabold">How do you sell?</legend>
        <div className="grid gap-3">
          {SELLING_MODES.map((option) => (
            <label
              key={option.value}
              className={`block cursor-pointer rounded-md border-2 p-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
                mode === option.value ? "border-ink bg-ink text-white" : "border-field bg-white text-ink hover:border-ink"
              }`}
            >
              <input
                type="radio"
                name="sellingMode"
                value={option.value}
                checked={mode === option.value}
                onChange={() => choose(option.value)}
                required
                className="sr-only"
              />
              <span className="block text-lg font-extrabold">{option.title}</span>
              <span className={`block text-sm ${mode === option.value ? "text-nav" : "text-ink-soft"}`}>{option.detail}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {mode ? (
        <fieldset className="space-y-4 rounded-md border-2 border-ink p-4">
          <legend className="px-1 text-lg font-extrabold">A few more questions</legend>
          {mode === "quantity" ? (
            <>
              <CheckboxField
                label="I sell drinks (RGB crates and PET packs)"
                name="sellsDrinks"
                defaultChecked={drinks}
                hint="Soft drinks, beer, water. RGB crates must come back as empties; PET packs, cans and cartons do not. BukAm keeps one count of your empties."
              />
              {returns && !drinks ? (
                // Kept for businesses that already track other returnables.
                <CheckboxField
                  label="Customers bring things back to me"
                  name="tracksReturns"
                  defaultChecked={returns}
                  hint="Gas cylinders, pallets, water bottles. BukAm tracks what each customer still owes you."
                />
              ) : null}
              <CheckboxField
                label="I also sell some items with serial numbers"
                name="tracksSerials"
                defaultChecked={serials}
                hint="For example a few generators. Each one is recorded by its serial."
              />
            </>
          ) : returns ? (
            // Not asked of a phone shop, but kept if it was already on.
            <input type="hidden" name="tracksReturns" value="on" />
          ) : null}
          <CheckboxField
            label="We deliver to customers"
            name="doesDelivery"
            checked={delivers}
            onChange={(event) => {
              setDeliveryTouched(true);
              setDelivers(event.currentTarget.checked);
            }}
            hint="Shows Dispatch, where you group orders onto trips for a driver. Leave it unticked if customers buy at your shop."
          />
          <p className="text-sm text-ink-soft">You can change all of this later in Settings.</p>
        </fieldset>
      ) : null}
    </div>
  );
}
