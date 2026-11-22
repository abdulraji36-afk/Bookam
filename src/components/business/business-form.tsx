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
      {askFeatures ? (
        <WorkspaceChoice types={types.filter((type) => type !== "Drinks depot")} />
      ) : (
        <SelectField label="What kind of business is it?" name="businessType" defaultValue={defaults?.businessType ?? ""}>
          <option value="">Choose one (optional)</option>
          {types.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </SelectField>
      )}
      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingLabel={pendingLabel}>
        {submitLabel}
      </SubmitButton>
    </form>
  );
}

const DRINKS_INCLUDES = [
  "RGB and PET orders for several customers at once, with stock left on every product",
  "Trips with a driver and workers, and the empties each customer brings back",
  "Empty shortages per order, follow-ups, empty exchanges and the empty balance",
  "Stock in, stock summary, inventory value, daily report and transaction records",
  "Any brand of drink, with the NBC (Coca-Cola) list ready to add from"
];

/**
 * At sign-up, the first choice: the Drinks depot workspace, everything for a
 * drinks depot switched on in one go, or another kind of business, which
 * answers the usual questions about how it sells.
 */
function WorkspaceChoice({ types }: { types: string[] }) {
  const [workspace, setWorkspace] = useState<"drinks" | "other" | null>(null);
  const options = [
    {
      value: "drinks" as const,
      title: "Drinks depot",
      detail: "RGB crates and empties, PET packs, trips and empty shortages, the Bilikis way."
    },
    {
      value: "other" as const,
      title: "Another kind of business",
      detail: "Shops, phones and gadgets, gas, building materials, warehouses and more."
    }
  ];

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-lg font-extrabold">Choose your workspace</legend>
        <div className="grid gap-3">
          {options.map((option) => (
            <label
              key={option.value}
              className={`block cursor-pointer rounded-md border-2 p-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
                workspace === option.value ? "border-ink bg-ink text-white" : "border-field bg-white text-ink hover:border-ink"
              }`}
            >
              <input
                type="radio"
                name="workspace"
                value={option.value}
                checked={workspace === option.value}
                onChange={() => setWorkspace(option.value)}
                required
                className="sr-only"
              />
              <span className="block text-lg font-extrabold">{option.title}</span>
              <span className={`block text-sm ${workspace === option.value ? "text-nav" : "text-ink-soft"}`}>{option.detail}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {workspace === "drinks" ? (
        <div className="space-y-3 rounded-md border-2 border-ink p-4">
          <input type="hidden" name="businessType" value="Drinks depot" />
          <p className="text-lg font-extrabold">Your drinks depot comes with</p>
          <ul className="space-y-2 text-sm">
            {DRINKS_INCLUDES.map((line) => (
              <li key={line} className="flex gap-2">
                <span aria-hidden className="font-extrabold text-success">✓</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-ink-soft">You can change this later in Settings.</p>
        </div>
      ) : null}

      {workspace === "other" ? (
        <>
          <SelectField label="What kind of business is it?" name="businessType" defaultValue="">
            <option value="">Choose one (optional)</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </SelectField>
          <SellingQuestions offerDrinks={false} />
        </>
      ) : null}
    </div>
  );
}

/** A goods business at sign-up: does anything come back, and what is it called? */
function GoodsReturns() {
  const [comesBack, setComesBack] = useState(false);
  return (
    <div className="space-y-3">
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
          placeholder="e.g. Empty cylinders"
          hint="One name for all of it. You can change it later in Settings."
          maxLength={40}
          required
        />
      ) : null}
    </div>
  );
}

type SellingDefaults = {
  mode?: SellingMode;
  returns?: boolean;
  serials?: boolean;
  delivery?: boolean;
  drinks?: boolean;
  /** At sign-up the drinks depot is its own workspace, so it is not asked again here. */
  offerDrinks?: boolean;
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
  drinks = false,
  offerDrinks = true
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
          {mode === "quantity" && !offerDrinks ? (
            // At sign-up a goods business gets the depot workspace (as drinks
            // does): returnable goods work like RGB, the rest like PET.
            <GoodsReturns />
          ) : mode === "quantity" ? (
            <>
              {offerDrinks ? (
                <CheckboxField
                  label="I sell drinks (RGB crates and PET packs)"
                  name="sellsDrinks"
                  defaultChecked={drinks}
                  hint="Soft drinks, beer, water. RGB crates must come back as empties; PET packs, cans and cartons do not. BukAm keeps one count of your empties."
                />
              ) : null}
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
