"use client";

import { useSay, useWords } from "@/components/business/words-context";
import { useId, useState } from "react";
import { FormMessage } from "@/components/ui/alert";
import { CheckboxField, SelectField, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { DRINK_CATEGORIES } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";

const UNITS = [
  "crate",
  "pack",
  "carton",
  "bag",
  "cylinder",
  "bottle",
  "piece",
  "phone",
  "laptop",
  "unit",
];

export type ProductDefaults = {
  name: string;
  sku: string;
  unit: string;
  sellingPrice: string;
  costPrice: string;
  lowStock: string;
  returnItemName: string;
  category?: string;
  tracksSerials: boolean;
  warrantyMonths: string;
};

type Props = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  currency: string;
  /** Things customers already bring back for other products. */
  returnables: string[];
  /** Which product options this business uses. */
  features: {
    returns: boolean;
    serials: boolean;
    serialByDefault?: boolean;
    drinks?: boolean;
  };
  defaults?: ProductDefaults;
  /** Drinks: categories this business already uses, offered with the usual ones. */
  categories?: string[];
};

export function ProductForm({
  action,
  currency,
  returnables,
  features,
  defaults,
  categories = [],
}: Props) {
  const t = useSay();
  // A drinks depot sells RGB by the crate and PET by the pack, so it is not
  // asked the unit; a goods depot says its own (cylinder, bag, carton).
  const words = useWords();
  const drinksUnits = Boolean(features.drinks) && words.trade === "drinks";
  const { state, pending, form } = useFormAction(action);
  const [requiresReturn, setRequiresReturn] = useState(
    Boolean(defaults?.returnItemName),
  );
  // A new product in a phone shop starts as serial-numbered; untick it for
  // accessories that are simply counted.
  const [tracksSerials, setTracksSerials] = useState(
    defaults ? defaults.tracksSerials : Boolean(features.serialByDefault),
  );
  // Drinks: RGB or PET is chosen on purpose for a new product, never assumed.
  // A goods depot where nothing comes back sells everything as non-returnable.
  const nothingComesBack = Boolean(features.drinks) && !features.returns && !defaults?.returnItemName;
  const [drinkKind, setDrinkKind] = useState<"rgb" | "pet" | null>(
    defaults ? (defaults.returnItemName ? "rgb" : "pet") : nothingComesBack ? "pet" : null,
  );
  // RGB is sold by the crate and PET by the pack, so drinks are not asked.
  const drinkUnit =
    drinkKind === "rgb"
      ? "crate"
      : defaults?.unit && defaults.unit !== "crate"
        ? defaults.unit
        : "pack";
  const unitListId = useId();
  const returnListId = useId();

  return (
    <form {...form} className="space-y-5">
      <TextField
        label="Product name"
        name="name"
        defaultValue={defaults?.name}
        maxLength={80}
        required
      />
      <div className="grid gap-5 sm:grid-cols-2">
        {drinksUnits ? (
          <input type="hidden" name="unit" value={drinkUnit} />
        ) : (
          <TextField
            label="Sold by the"
            name="unit"
            list={unitListId}
            defaultValue={defaults?.unit ?? (features.drinks ? "" : "crate")}
            hint="The unit you count this product in."
            maxLength={30}
            required
          />
        )}
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
          hint={
            features.drinks
              ? t("Per unit. Needed before the drink can be sold.")
              : "Per unit. Leave empty to set it later."
          }
          required={features.drinks}
        />
        <TextField
          label={`Buying cost (${currency})`}
          name="costPrice"
          inputMode="decimal"
          defaultValue={defaults?.costPrice}
          hint="Only owners and admins can see this."
          required={features.drinks}
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

      {features.drinks ? (
        <DrinkKind
          returnables={returnables}
          kind={drinkKind}
          onChange={(next) => {
            setDrinkKind(next);
            setRequiresReturn(next === "rgb");
          }}
          defaultReturnable={defaults?.returnItemName}
          defaultCategory={defaults?.category}
          categories={categories}
          fixed={nothingComesBack}
        />
      ) : features.returns || requiresReturn ? (
        <div className="space-y-4 rounded-md border-2 border-ink p-4">
          <CheckboxField
            label="Customers must bring something back"
            name="requiresReturn"
            checked={requiresReturn}
            onChange={(event) => setRequiresReturn(event.currentTarget.checked)}
            hint={t("Tick this for goods sold in a crate, cylinder or other container you need returned. Leave it off for goods that are simply sold.")}
          />
          {requiresReturn ? (
            <>
              <TextField
                label="What must they bring back?"
                name="returnItemName"
                list={returnListId}
                defaultValue={defaults?.returnItemName}
                placeholder={t("e.g. Empty crate")}
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
      ) : null}

      {features.serials || tracksSerials ? (
        <div className="space-y-4 rounded-md border-2 border-ink p-4">
          <CheckboxField
            label="Track each unit by serial number"
            name="tracksSerials"
            checked={tracksSerials}
            onChange={(event) => setTracksSerials(event.currentTarget.checked)}
            hint="For phones, laptops and anything with a serial or IMEI. Each unit is entered when stock arrives, with its colour, and you choose the exact unit when you sell it. To sell by condition, make a product for each, such as iPhone 15 128GB UK used."
          />
          {tracksSerials ? (
            <TextField
              label="Warranty in months (optional)"
              name="warrantyMonths"
              inputMode="numeric"
              defaultValue={defaults?.warrantyMonths}
              hint="Looking up a serial number then shows whether it is still under warranty."
              maxLength={3}
            />
          ) : null}
        </div>
      ) : null}

      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save product
      </SubmitButton>
    </form>
  );
}

/**
 * Like Bilikis: a drink is either RGB (comes in a crate whose empty must come
 * back) or PET (packs, cans, cartons: nothing comes back). The empties pool is
 * named once for the business, so nothing is typed here.
 */
function DrinkKind({
  returnables,
  kind,
  onChange,
  defaultReturnable,
  defaultCategory,
  categories,
  fixed = false,
}: {
  /** Nothing comes back in this business: no choice to make, only the category. */
  fixed?: boolean;
  returnables: string[];
  kind: "rgb" | "pet" | null;
  onChange: (kind: "rgb" | "pet") => void;
  defaultReturnable?: string;
  defaultCategory?: string;
  categories: string[];
}) {
  const t = useSay();
  const goods = useWords().trade === "goods";
  // The usual drink categories, then any of the business's own (Beer, Malt...).
  // A goods depot has only its own.
  const suggestions = [
    ...(goods ? [] : DRINK_CATEGORIES),
    ...categories.filter(
      (name) =>
        name.toUpperCase() !== "RGB" &&
        !DRINK_CATEGORIES.some((usual) => usual.toLowerCase() === name.toLowerCase()),
    ),
  ];
  const requiresReturn = kind === "rgb";
  const options = [
    {
      value: "rgb" as const,
      title: t("RGB"),
      detail: goods
        ? "It comes in a container the customer must bring back, such as a gas cylinder, pallet or bottle."
        : "Glass bottles, sold by the crate. The customer must bring the empty crate back.",
    },
    {
      value: "pet" as const,
      title: goods ? "Non-returnable" : "PET, can or carton",
      detail: goods ? "Sold outright. Nothing comes back." : "Sold by the pack. Nothing comes back.",
    },
  ];
  return (
    <fieldset className="space-y-3">
      {fixed ? <input type="hidden" name="drinkKind" value="pet" /> : null}
      {fixed ? null : (
        <legend className="mb-1.5 text-sm font-bold">
          {goods ? "Does anything come back with it?" : "What kind of drink is it?"}
        </legend>
      )}
      {fixed ? null : (
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label
            key={option.title}
            className={`flex cursor-pointer gap-3 rounded-md border-2 p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
              kind === option.value
                ? "border-ink bg-paper"
                : "border-line bg-white"
            }`}
          >
            <input
              type="radio"
              name="drinkKind"
              value={option.value}
              checked={kind === option.value}
              onChange={() => onChange(option.value)}
              required
              className="mt-1 size-5 shrink-0 accent-ink"
            />
            <span>
              <span className="block font-extrabold">{option.title}</span>
              <span className="text-sm text-ink-soft">{option.detail}</span>
            </span>
          </label>
        ))}
      </div>
      )}
      {kind === "pet" ? (
        <>
          <TextField
            label="Category"
            name="category"
            list="drink-categories"
            defaultValue={
              defaultCategory && defaultCategory !== "RGB" ? defaultCategory : ""
            }
            placeholder="Choose or type a category"
            hint={goods ? "Type a category, such as Cooking gas or Accessories. Ones you used before are offered." : "Pick one, or type your own, such as Beer, Malt or Sachet water."}
            maxLength={30}
            autoComplete="off"
            required
          />
          <datalist id="drink-categories">
            {suggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </>
      ) : null}
      {requiresReturn ? (
        <>
          <input type="hidden" name="category" value="RGB" />
          <input type="hidden" name="requiresReturn" value="on" />
          {returnables.length > 1 ? (
            <SelectField
              label={t("Which empties come back?")}
              name="returnItemName"
              defaultValue={defaultReturnable ?? returnables[0]}
            >
              {returnables.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </SelectField>
          ) : (
            <input
              type="hidden"
              name="returnItemName"
              value={returnables[0] ?? "Empties"}
            />
          )}
        </>
      ) : null}
    </fieldset>
  );
}
