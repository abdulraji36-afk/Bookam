"use client";

import { useState } from "react";
import { UnitPicker, type PickableUnit } from "@/components/orders/unit-picker";
import { FormMessage } from "@/components/ui/alert";
import { SelectField, TextField } from "@/components/ui/field";
import { SearchSelect } from "@/components/ui/search-select";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { formatQuantity, STOCK_IN_REASONS, STOCK_OUT_REASONS } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";
import type { StockAdjustmentReason } from "@/types/database";

export type AdjustProduct = { id: string; name: string; unit: string; tracksSerials: boolean };

type Props = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  products: AdjustProduct[];
  locations: { id: string; name: string }[];
  units: PickableUnit[];
  /** Stock on hand: location id -> product id -> quantity. */
  stock: Record<string, Record<string, number>>;
  today: string;
};

export function AdjustStockForm({ action, products, locations, units, stock, today }: Props) {
  const { state, pending, form } = useFormAction(action);
  const [direction, setDirection] = useState<"subtract" | "add">("subtract");
  const [reason, setReason] = useState<StockAdjustmentReason>("damaged");
  const [productId, setProductId] = useState("");
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  const product = products.find((item) => item.id === productId);
  const tracked = product?.tracksSerials ?? false;
  const reasons = direction === "subtract" ? STOCK_OUT_REASONS : STOCK_IN_REASONS;
  const inStock = product ? (stock[locationId]?.[product.id] ?? 0) : null;

  function choose(next: "subtract" | "add") {
    setDirection(next);
    setReason(next === "subtract" ? "damaged" : "found");
  }

  return (
    <form {...form} className="space-y-5">
      <fieldset>
        <legend className="mb-1.5 text-sm font-bold">Take out or add?</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["subtract", "− Take out"],
              ["add", "+ Add"]
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={`flex min-h-12 cursor-pointer items-center justify-center rounded-md border-2 border-ink px-3 font-extrabold uppercase tracking-wide has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
                direction === value ? "bg-ink text-white" : "bg-white text-ink"
              }`}
            >
              <input
                type="radio"
                name="direction"
                value={value}
                checked={direction === value}
                onChange={() => choose(value)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <SearchSelect
            label="Product"
            name="productId"
            placeholder="Type a product to search"
            value={productId}
            onChange={(next) => {
              setProductId(next);
              setChosen(new Set());
            }}
            options={products.map((option) => ({
              value: option.id,
              label: `${option.name} (${option.unit})`,
              detail: `${formatQuantity(stock[locationId]?.[option.id] ?? 0)} in stock${option.tracksSerials ? " · serial numbers" : ""}`,
              // Serial-numbered stock only comes in through a delivery, with its serials.
              disabled: direction === "add" && option.tracksSerials
            }))}
          />
        </div>
        <SelectField
          label="Reason"
          name="reason"
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value as StockAdjustmentReason)}
        >
          {reasons.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        {tracked ? (
          <input type="hidden" name="quantity" value="" />
        ) : (
          <TextField
            label="Quantity"
            name="quantity"
            inputMode="decimal"
            autoComplete="off"
            hint={inStock !== null && product ? `${formatQuantity(inStock)} ${product.unit} in stock here.` : undefined}
          />
        )}
        <TextField label="Date" name="adjustmentDate" type="date" defaultValue={today} max={today} required />
        {locations.length > 1 ? (
          <SelectField
            label="At which location?"
            name="locationId"
            value={locationId}
            onChange={(event) => {
              setLocationId(event.currentTarget.value);
              setChosen(new Set());
            }}
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <input type="hidden" name="locationId" value={locationId} />
        )}
      </div>

      {tracked && product ? (
        <UnitPicker
          lineKey={0}
          units={units.filter((unit) => unit.productId === product.id && unit.locationId === locationId)}
          chosen={chosen}
          onToggle={(unitId) =>
            setChosen((current) => {
              const next = new Set(current);
              if (next.has(unitId)) next.delete(unitId);
              else next.add(unitId);
              return next;
            })
          }
          unitWord={product.unit}
          verb="taken out"
        />
      ) : null}

      <TextField
        label={reason === "count_correction" ? "Why is the count being corrected?" : "Note (optional)"}
        name="note"
        maxLength={500}
        required={reason === "count_correction"}
      />
      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        {direction === "subtract" ? "Take out of stock" : "Add to stock"}
      </SubmitButton>
    </form>
  );
}
