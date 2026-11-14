"use client";

import { useState } from "react";
import { FormMessage } from "@/components/ui/alert";
import { Badge } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import type { StarterDrink } from "@/lib/nbc-products";
import { useFormAction } from "@/lib/use-form-action";

const INPUT =
  "block min-h-11 w-full rounded-md border-2 border-field bg-white px-2 text-base font-medium tabular-nums focus:border-ink focus:outline-2 focus:outline-accent disabled:bg-chip";

type Props = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  products: (StarterDrink & { added: boolean })[];
  currency: string;
};

/** Tick the drinks you sell and enter each one's price and cost. */
export function NbcListForm({ action, products, currency }: Props) {
  const { state, pending, form } = useFormAction(action);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  return (
    <form {...form} className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem]">
          <thead>
            <tr className="border-b border-line text-left text-xs font-extrabold uppercase tracking-wide text-ink-soft">
              <th scope="col" className="px-3 py-2.5">Add</th>
              <th scope="col" className="px-3 py-2.5">Product</th>
              <th scope="col" className="px-3 py-2.5">Selling price ({currency})</th>
              <th scope="col" className="px-3 py-2.5">Buying cost ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {products.map((product) => {
              const on = picked.has(product.code);
              return (
                <tr key={product.code} className={on ? "bg-paper" : undefined}>
                  <td className="px-3 py-2">
                    {product.added ? null : (
                      <input
                        type="checkbox"
                        name={`pick-${product.code}`}
                        aria-label={`Add ${product.name}`}
                        checked={on}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          setPicked((current) => {
                            const next = new Set(current);
                            if (checked) next.add(product.code);
                            else next.delete(product.code);
                            return next;
                          });
                        }}
                        className="size-6 accent-ink"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="block font-extrabold">{product.name}</span>
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink-soft">
                      {product.category} · per {product.unit}
                      {product.added ? <Badge tone="success">Already added</Badge> : null}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      name={`price-${product.code}`}
                      inputMode="decimal"
                      aria-label={`Selling price for ${product.name}`}
                      disabled={!on}
                      required={on}
                      className={INPUT}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      name={`cost-${product.code}`}
                      inputMode="decimal"
                      aria-label={`Buying cost for ${product.name}`}
                      disabled={!on}
                      required={on}
                      className={INPUT}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingLabel="Adding…">
        {picked.size ? `Add ${picked.size} product${picked.size === 1 ? "" : "s"}` : "Tick the products you sell"}
      </SubmitButton>
    </form>
  );
}
