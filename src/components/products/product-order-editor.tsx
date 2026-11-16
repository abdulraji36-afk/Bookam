"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useState } from "react";
import { FormMessage } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { useFormAction } from "@/lib/use-form-action";

type Item = { id: string; name: string; category: string; picture: React.ReactNode };

/**
 * Bilikis's "Reorder products": move each product up or down, then save.
 * The order screen, stock summary, daily report and inventory value follow it.
 */
export function ProductOrderEditor({
  action,
  items,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  items: Item[];
}) {
  const [order, setOrder] = useState(items);
  const { state, pending, form } = useFormAction(action);
  const move = (index: number, by: number) =>
    setOrder((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(index + by, 0, item);
      return next;
    });
  const step = "inline-grid size-10 place-items-center rounded-md border-2 border-field bg-white disabled:opacity-30";

  return (
    <form {...form} className="space-y-4 p-5">
      <input type="hidden" name="ids" value={order.map((item) => item.id).join(",")} />
      <div role="list" className="divide-y divide-line rounded-md border-2 border-line">
        {order.map((item, index) => (
          <div role="listitem" key={item.id} className="flex items-center gap-3 px-3 py-2">
            <span className="w-7 text-right text-sm font-extrabold tabular-nums text-ink-soft">{index + 1}</span>
            {item.picture}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-extrabold">{item.name}</span>
              <span className="text-sm text-ink-soft">{item.category}</span>
            </span>
            <button
              type="button"
              className={step}
              disabled={index === 0}
              onClick={() => move(index, -1)}
              aria-label={`Move ${item.name} up`}
            >
              <ArrowUp aria-hidden className="size-4" />
            </button>
            <button
              type="button"
              className={step}
              disabled={index === order.length - 1}
              onClick={() => move(index, 1)}
              aria-label={`Move ${item.name} down`}
            >
              <ArrowDown aria-hidden className="size-4" />
            </button>
          </div>
        ))}
      </div>
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={pending} pendingLabel="Saving…">
          Save order
        </SubmitButton>
        <button type="button" className={buttonClass("ghost")} onClick={() => setOrder(items)}>
          Undo changes
        </button>
      </div>
    </form>
  );
}
