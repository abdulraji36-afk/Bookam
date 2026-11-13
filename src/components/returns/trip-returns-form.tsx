"use client";

import { useState } from "react";
import { FormMessage } from "@/components/ui/alert";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { formatQuantity } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";

export type ReturnLine = {
  orderId: string;
  returnableItemId: string;
  customerName: string;
  returnableName: string;
  expected: number;
};

type Props = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  lines: ReturnLine[];
  today: string;
  dispatchDate: string;
};

export function TripReturnsForm({ action, lines, today, dispatchDate }: Props) {
  const { state, pending, form } = useFormAction(action);
  // Start from "everything came back"; staff only change the ones that did not.
  const [returned, setReturned] = useState(() => lines.map((line) => String(line.expected)));

  return (
    <form {...form} className="space-y-5">
      <TextField
        label="Date the trip came back"
        name="returnedDate"
        type="date"
        defaultValue={today}
        min={dispatchDate}
        max={today}
        required
      />

      <ul className="divide-y divide-line rounded-md border-2 border-ink">
        {lines.map((line, index) => {
          const value = Number(returned[index]);
          const difference = Number.isFinite(value) && returned[index].trim() !== "" ? line.expected - value : null;

          return (
            <li key={`${line.orderId}-${line.returnableItemId}`} className="flex flex-wrap items-end justify-between gap-3 px-4 py-3">
              <input type="hidden" name="orderId" value={line.orderId} />
              <input type="hidden" name="returnableItemId" value={line.returnableItemId} />
              <div className="min-w-0">
                <p className="text-lg font-extrabold">{line.customerName}</p>
                <p className="font-medium text-ink-soft">
                  Should bring back {formatQuantity(line.expected)} {line.returnableName}
                </p>
                {difference !== null && difference > 0 ? (
                  <p className="text-sm font-bold text-danger">
                    Short by {formatQuantity(difference)}. It stays on their balance.
                  </p>
                ) : null}
                {difference !== null && difference < 0 ? (
                  <p className="text-sm font-bold text-success">
                    {formatQuantity(-difference)} extra. It comes off what they owed before.
                  </p>
                ) : null}
              </div>
              <div className="w-28">
                <TextField
                  label="Returned"
                  aria-label={`Returned by ${line.customerName}`}
                  name="returned"
                  inputMode="decimal"
                  autoComplete="off"
                  value={returned[index]}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setReturned((current) => current.map((item, position) => (position === index ? next : item)));
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Record returns and complete trip
      </SubmitButton>
    </form>
  );
}
