"use client";

import { useSay } from "@/components/business/words-context";
import { useState } from "react";
import { FormMessage } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { useFormAction } from "@/lib/use-form-action";

type Line = { productId: string; quantity: string };

const CONTROL =
  "block min-h-12 w-full rounded-md border-2 border-field bg-white px-3 text-base font-medium focus:border-ink focus:outline-2 focus:outline-accent";

/**
 * Bilikis's admin sale correction: change the products and quantities of a
 * sale that has already gone out. Stock and empties follow; a reason is kept.
 */
export function CorrectSaleForm({
  action,
  products,
  lines: initial,
  kind,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  products: { id: string; name: string }[];
  lines: { productId: string; quantity: number }[];
  kind: "RGB" | "PET";
}) {
  const t = useSay();
  const { state, pending, form } = useFormAction(action);
  const [lines, setLines] = useState<Line[]>(
    initial.map((line) => ({ productId: line.productId, quantity: String(line.quantity) })),
  );
  const chosen = new Set(lines.map((line) => line.productId));
  const update = (index: number, change: Partial<Line>) =>
    setLines((current) => current.map((line, at) => (at === index ? { ...line, ...change } : line)));
  const items = lines
    .filter((line) => line.productId)
    .map((line) => ({ product_id: line.productId, quantity: line.quantity.trim() }));

  return (
    <details className="w-full rounded-md border-2 border-ink bg-white">
      <summary className="cursor-pointer select-none px-4 py-3 font-extrabold uppercase tracking-wide">
        Correct this sale
      </summary>
      <form {...form} className="space-y-4 border-t-2 border-ink p-4">
        <p className="text-sm font-medium text-ink-soft">
          Change the {kind} products and quantities as they really went out. Stock
          {kind === "RGB" ? t(", the empties the customer owes and the empties expected back") : ""} follow
          the corrected figures. Prices stay as sold.
        </p>
        <input type="hidden" name="items" value={JSON.stringify(items)} />
        <div className="space-y-3">
          {lines.map((line, index) => (
            <div key={index} className="grid grid-cols-[1fr_7rem_auto] items-end gap-2">
              <label className="block text-sm font-bold">
                {index === 0 ? "Product" : <span className="sr-only">Product</span>}
                <select
                  className={`${CONTROL} mt-1.5`}
                  value={line.productId}
                  aria-label={`Product on line ${index + 1}`}
                  onChange={(event) => update(index, { productId: event.target.value })}
                >
                  <option value="">Choose…</option>
                  {products
                    .filter((product) => product.id === line.productId || !chosen.has(product.id))
                    .map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block text-sm font-bold">
                {index === 0 ? "Quantity" : <span className="sr-only">Quantity</span>}
                <input
                  className={`${CONTROL} mt-1.5`}
                  inputMode="numeric"
                  autoComplete="off"
                  value={line.quantity}
                  aria-label={`Quantity on line ${index + 1}`}
                  onChange={(event) => update(index, { quantity: event.target.value })}
                />
              </label>
              <button
                type="button"
                className={buttonClass("ghost", "sm")}
                disabled={lines.length === 1}
                onClick={() => setLines((current) => current.filter((_, at) => at !== index))}
                aria-label={`Remove line ${index + 1}`}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        {lines.length < products.length ? (
          <button
            type="button"
            className={buttonClass("secondary", "sm")}
            onClick={() => setLines((current) => [...current, { productId: "", quantity: "" }])}
          >
            + Add a product
          </button>
        ) : null}
        <TextField
          label="Reason"
          name="reason"
          maxLength={500}
          placeholder="Why is this sale being corrected?"
          hint="At least 10 characters."
          required
        />
        <FormMessage state={state} />
        <SubmitButton variant="primary" size="sm" pending={pending} pendingLabel="Saving…">
          Save correction
        </SubmitButton>
      </form>
    </details>
  );
}
