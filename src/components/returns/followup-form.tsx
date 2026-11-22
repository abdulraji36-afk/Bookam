"use client";

import { useSay } from "@/components/business/words-context";
import { useMemo, useState } from "react";
import { FormMessage } from "@/components/ui/alert";
import { TextField } from "@/components/ui/field";
import { SearchSelect } from "@/components/ui/search-select";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { formatDay, formatQuantity } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

export type OpenShortage = {
  id: string;
  customerId: string | null;
  customerName: string;
  orderNo: string;
  tripNo: string;
  returnedDate: string | null;
  outstanding: number;
};

function Fields({ today, minDate, max }: { today: string; minDate?: string | null; max: number }) {
  const t = useSay();
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label={t("How many empties did they bring?")}
          name="quantity"
          inputMode="numeric"
          autoComplete="off"
          hint={max > 0 ? `At most ${formatQuantity(max)}, what is still owed.` : undefined}
          required
        />
        <TextField
          label="Date received"
          name="receivedDate"
          type="date"
          defaultValue={today}
          min={minDate ?? undefined}
          max={today}
          required
        />
      </div>
      <TextField label="Note (optional)" name="note" maxLength={500} />
    </>
  );
}

/** A follow-up return against one order, on that order's page. */
export function FollowupForm({
  action,
  lineId,
  outstanding,
  returnedDate,
  today
}: {
  action: Action;
  lineId: string;
  outstanding: number;
  returnedDate: string | null;
  today: string;
}) {
  const { state, pending, form } = useFormAction(action);
  return (
    <form {...form} className="space-y-5">
      <input type="hidden" name="lineId" value={lineId} />
      <input type="hidden" name="returnTo" value="order" />
      <Fields today={today} minDate={returnedDate} max={outstanding} />
      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingLabel="Recording…">
        Record follow-up return
      </SubmitButton>
    </form>
  );
}

/** "Customer brought back empties": choose the customer, then which of their orders it pays off. */
export function CustomerFollowupForm({
  action,
  shortages,
  today,
  returnTo = "returns"
}: {
  action: Action;
  shortages: OpenShortage[];
  today: string;
  returnTo?: "returns" | "shortages";
}) {
  const { state, pending, form } = useFormAction(action);
  const customers = useMemo(() => {
    const byCustomer = new Map<string, { value: string; label: string; owed: number }>();
    for (const line of shortages) {
      const key = line.customerId ?? line.customerName;
      const entry = byCustomer.get(key) ?? { value: key, label: line.customerName, owed: 0 };
      entry.owed += line.outstanding;
      byCustomer.set(key, entry);
    }
    return [...byCustomer.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [shortages]);
  const [customer, setCustomer] = useState("");
  const lines = shortages.filter((line) => (line.customerId ?? line.customerName) === customer);
  const [lineId, setLineId] = useState("");
  const chosen = lines.find((line) => line.id === lineId) ?? (lines.length === 1 ? lines[0] : undefined);

  return (
    <form {...form} className="space-y-5">
      <input type="hidden" name="returnTo" value={returnTo} />
      <SearchSelect
        label="Customer"
        name="customer"
        placeholder="Type a name to search"
        value={customer}
        onChange={(next) => {
          setCustomer(next);
          setLineId("");
        }}
        options={customers.map((entry) => ({
          value: entry.value,
          label: entry.label,
          detail: `owes ${formatQuantity(entry.owed)}`
        }))}
      />

      {customer ? (
        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-sm font-bold">Which order is it for?</legend>
          {lines.map((line) => (
            <label
              key={line.id}
              className="flex cursor-pointer items-start gap-3 rounded-md border-2 border-field bg-white px-4 py-3 has-[:checked]:border-ink"
            >
              <input
                type="radio"
                name="lineId"
                value={line.id}
                checked={chosen?.id === line.id}
                onChange={() => setLineId(line.id)}
                className="mt-1 size-5 accent-ink"
                required
              />
              <span>
                <span className="block font-extrabold">
                  {line.orderNo} · {formatQuantity(line.outstanding)} still owed
                </span>
                <span className="block text-sm font-medium text-ink-soft">
                  Trip {line.tripNo}
                  {line.returnedDate ? `, back ${formatDay(line.returnedDate)}` : ""}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      {chosen ? <Fields today={today} minDate={chosen.returnedDate} max={chosen.outstanding} /> : null}
      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save
      </SubmitButton>
    </form>
  );
}
