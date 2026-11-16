"use client";

import { FormMessage } from "@/components/ui/alert";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { useFormAction } from "@/lib/use-form-action";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

const SELECT =
  "mt-1.5 block min-h-12 w-full rounded-md border-2 border-field bg-white px-3 text-base font-medium focus:border-ink focus:outline-2 focus:outline-accent";

/** Bilikis's "Set opening empties". Setting it again changes the same count. */
export function OpeningEmptiesForm({
  action,
  today,
  returnableItemId,
  locations,
  current,
}: {
  action: Action;
  today: string;
  returnableItemId: string;
  locations: { id: string; name: string }[];
  current: { quantity: number; date: string } | null;
}) {
  const { state, pending, form } = useFormAction(action);

  return (
    <form {...form} className="space-y-4">
      <input type="hidden" name="returnableItemId" value={returnableItemId} />
      {locations.length > 1 ? (
        <label className="block text-sm font-bold">
          Location
          <select className={SELECT} name="locationId" defaultValue={locations[0]?.id}>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="locationId" value={locations[0]?.id ?? ""} />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Opening empties"
          name="quantity"
          inputMode="numeric"
          autoComplete="off"
          defaultValue={current ? String(current.quantity) : undefined}
          hint="Empty crates already on the ground before the depot started here."
          required
        />
        <TextField
          label="Counted on"
          name="date"
          type="date"
          defaultValue={current?.date ?? today}
          max={today}
          required
        />
      </div>
      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        {current ? "Update opening empties" : "Set opening empties"}
      </SubmitButton>
    </form>
  );
}
