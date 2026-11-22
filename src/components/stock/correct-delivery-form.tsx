"use client";

import { useSay } from "@/components/business/words-context";
import { useRef, useState } from "react";
import { FormMessage } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { SearchSelect } from "@/components/ui/search-select";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { useFormAction } from "@/lib/use-form-action";

type Line = { key: number; productId: string; quantity: string; cost: string };

type Props = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  products: { id: string; name: string; unit: string }[];
  currency: string;
  today: string;
  referenceRequired: boolean;
  defaults: {
    receivedDate: string;
    supplierName: string;
    reference: string;
    note: string;
    lines: { productId: string; quantity: number; cost: number | null }[];
  };
};

/**
 * Corrects a delivery after the fact, as in Bilikis: the date, supplier and
 * reference, and its products. Add or remove products and change numbers;
 * stock and the reports follow.
 */
export function CorrectDeliveryForm({ action, products, currency, today, referenceRequired, defaults }: Props) {
  const t = useSay();
  const { state, pending, form } = useFormAction(action);
  const nextKey = useRef(defaults.lines.length);
  const [lines, setLines] = useState<Line[]>(
    defaults.lines.map((line, index) => ({
      key: index,
      productId: line.productId,
      quantity: String(line.quantity),
      cost: line.cost === null ? "" : String(line.cost)
    }))
  );
  const update = (key: number, change: Partial<Line>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...change } : line)));

  return (
    <form {...form} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Date the stock arrived"
          name="receivedDate"
          type="date"
          defaultValue={defaults.receivedDate}
          max={today}
          required
        />
        <TextField label="Supplier" name="supplierName" defaultValue={defaults.supplierName} maxLength={80} />
        <TextField
          label={referenceRequired ? "Supplier delivery reference" : "Delivery reference (optional)"}
          name="reference"
          defaultValue={defaults.reference}
          maxLength={80}
          required={referenceRequired}
        />
        <TextField label="Note (optional)" name="note" defaultValue={defaults.note} maxLength={500} />
      </div>

      <fieldset className="space-y-4">
        <legend className="text-lg font-extrabold">Products kept</legend>
        {lines.map((line, index) => (
          <div
            key={line.key}
            className="grid grid-cols-2 items-end gap-2 rounded-md border-2 border-line p-3 sm:grid-cols-[1fr_7rem_8rem_auto] sm:border-0 sm:p-0"
          >
            <div className="col-span-2 sm:col-span-1">
              <SearchSelect
                label={index === 0 ? "Product" : `Product ${index + 1}`}
                name="productId"
                placeholder="Type a product to search"
                value={line.productId}
                onChange={(productId) => update(line.key, { productId })}
                options={products.map((product) => ({ value: product.id, label: `${product.name} (${product.unit})` }))}
              />
            </div>
            <TextField
              label="Quantity"
              name="quantity"
              inputMode="decimal"
              autoComplete="off"
              value={line.quantity}
              onChange={(event) => update(line.key, { quantity: event.currentTarget.value })}
              required
            />
            <TextField
              label={`Cost (${currency})`}
              name="unitCost"
              inputMode="decimal"
              autoComplete="off"
              value={line.cost}
              onChange={(event) => update(line.key, { cost: event.currentTarget.value })}
            />
            <Button
              type="button"
              variant="danger"
              size="sm"
              className="col-span-2 min-h-12 sm:col-span-1"
              disabled={lines.length === 1}
              aria-label={`Remove line ${index + 1}`}
              onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setLines((current) => [...current, { key: nextKey.current++, productId: "", quantity: "", cost: "" }])}
        >
          Add another product
        </Button>
      </fieldset>

      <TextField
        label="Reason for the correction"
        name="reason"
        maxLength={500}
        placeholder={t("e.g. 12 crates broken, handed back to the supplier")}
        hint="At least 10 characters. Kept with the delivery."
        required
      />
      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save correction
      </SubmitButton>
    </form>
  );
}
