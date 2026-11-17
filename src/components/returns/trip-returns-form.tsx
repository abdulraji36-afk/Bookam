"use client";

import { useRef, useState, type FormEvent } from "react";
import { FormMessage } from "@/components/ui/alert";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { formatQuantity } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";
import { useLeaveWarning } from "@/lib/use-leave-warning";

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
  // Every box starts empty, so nothing is saved by a careless click: staff
  // must count each one, 0 included.
  const [returned, setReturned] = useState(() => lines.map(() => ""));
  const [missing, setMissing] = useState<number | null>(null);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  // As in Bilikis: half-entered returns are not lost to a stray back press.
  const started = returned.some((value) => value.trim() !== "");
  useLeaveWarning(
    started && !pending && !state.ok,
    "Leave without saving these returns? The numbers you typed will be lost."
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const blank = returned.findIndex((value) => value.trim() === "");
    if (blank !== -1) {
      event.preventDefault();
      setMissing(blank);
      const box = boxes.current[blank];
      box?.scrollIntoView({ block: "center", behavior: "smooth" });
      box?.focus({ preventScroll: true });
      return;
    }
    setMissing(null);
    form.onSubmit(event);
  }

  return (
    <form {...form} onSubmit={onSubmit} className="space-y-5">
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
                  placeholder="0 or more"
                  ref={(element) => {
                    boxes.current[index] = element;
                  }}
                  aria-invalid={missing === index || undefined}
                  value={returned[index]}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setReturned((current) => current.map((item, position) => (position === index ? next : item)));
                    if (missing === index) setMissing(null);
                  }}
                />
              </div>
              {missing === index ? (
                <p
                  role="alert"
                  className="w-full rounded-md border-2 border-danger bg-danger-soft px-3 py-2 text-sm font-bold text-danger"
                >
                  Enter how many {line.returnableName} {line.customerName} brought back, 0 if none.
                </p>
              ) : null}
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
