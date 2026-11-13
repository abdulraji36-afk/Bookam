"use client";

import { useRef, useState } from "react";
import { FormMessage } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { SearchSelect } from "@/components/ui/search-select";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { useFormAction } from "@/lib/use-form-action";

type Props = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  products: { id: string; name: string; unit: string }[];
  locations: { id: string; name: string }[];
  today: string;
};

export function ReceiveStockForm({ action, products, locations, today }: Props) {
  const { state, pending, form } = useFormAction(action);
  // Each line only needs a stable key; the values live in the form fields.
  const nextKey = useRef(1);
  const [lines, setLines] = useState([0]);

  return (
    <form {...form} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Date the stock arrived"
          name="receivedDate"
          type="date"
          defaultValue={today}
          max={today}
          required
        />
        {locations.length > 1 ? (
          <SelectField label="Received at" name="locationId" defaultValue={locations[0].id}>
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
        <TextField
          label="Delivery reference (optional)"
          name="reference"
          hint="A waybill or invoice number, if there is one."
          maxLength={80}
        />
      </div>

      <fieldset className="space-y-3">
        <legend className="text-lg font-extrabold">Products received</legend>
        {lines.map((key, index) => (
          <div key={key} className="grid grid-cols-[1fr_auto] items-end gap-2 sm:grid-cols-[1fr_7rem_auto] sm:gap-3">
            <div className="col-span-2 sm:col-span-1">
            <SearchSelect
              label={index === 0 ? "Product" : `Product ${index + 1}`}
              name="productId"
              placeholder="Type a product to search"
              options={products.map((product) => ({
                value: product.id,
                label: `${product.name} (${product.unit})`
              }))}
            />
            </div>
            <TextField
              label="Quantity"
              name="quantity"
              inputMode="decimal"
              autoComplete="off"
            />
            <Button
              type="button"
              variant="danger"
              size="sm"
              className="min-h-12"
              disabled={lines.length === 1}
              aria-label={`Remove line ${index + 1}`}
              onClick={() => setLines((current) => current.filter((line) => line !== key))}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setLines((current) => [...current, nextKey.current++])}
        >
          Add another product
        </Button>
      </fieldset>

      <TextField label="Note (optional)" name="note" maxLength={500} />
      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save and add to stock
      </SubmitButton>
    </form>
  );
}
