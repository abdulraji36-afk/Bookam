"use client";

import { useState } from "react";
import type { Choice } from "@/components/returns/exchange-form";
import { FormMessage } from "@/components/ui/alert";
import { SelectField, TextField } from "@/components/ui/field";
import { SearchSelect } from "@/components/ui/search-select";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { ADD_REASONS, SUBTRACT_REASONS } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";
import type { ReturnableAdjustmentReason } from "@/types/database";

type Props = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  returnables: Choice[];
  locations: Choice[];
  customers: Choice[];
  today: string;
};

const NEEDS_CUSTOMER: ReturnableAdjustmentReason[] = ["customer_return", "given_to_customer"];

export function AdjustmentForm({ action, returnables, locations, customers, today }: Props) {
  const { state, pending, form } = useFormAction(action);
  const [direction, setDirection] = useState<"add" | "subtract">("add");
  const [reason, setReason] = useState<ReturnableAdjustmentReason>("customer_return");
  const reasons = direction === "add" ? ADD_REASONS : SUBTRACT_REASONS;
  const needsCustomer = NEEDS_CUSTOMER.includes(reason);

  function choose(next: "add" | "subtract") {
    setDirection(next);
    setReason(next === "add" ? "customer_return" : "damaged_or_lost");
  }

  return (
    <form {...form} className="space-y-5">
      <fieldset>
        <legend className="mb-1.5 text-sm font-bold">Add or subtract?</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["add", "subtract"] as const).map((option) => (
            <label
              key={option}
              className={`flex min-h-12 cursor-pointer items-center justify-center rounded-md border-2 border-ink px-3 font-extrabold uppercase tracking-wide has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
                direction === option ? "bg-ink text-white" : "bg-white text-ink"
              }`}
            >
              <input
                type="radio"
                name="direction"
                value={option}
                checked={direction === option}
                onChange={() => choose(option)}
                className="sr-only"
              />
              {option === "add" ? "+ Add" : "− Subtract"}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        {returnables.length > 1 ? (
          <SelectField label="Which item?" name="returnableItemId" defaultValue={returnables[0].id}>
            {returnables.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <input type="hidden" name="returnableItemId" value={returnables[0]?.id ?? ""} />
        )}
        <TextField
          label={returnables.length > 1 ? "How many?" : `How many ${returnables[0]?.name ?? ""}?`}
          name="quantity"
          inputMode="decimal"
          autoComplete="off"
          required
        />
        <SelectField
          label="Reason"
          name="reason"
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value as ReturnableAdjustmentReason)}
        >
          {reasons.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        {needsCustomer ? (
          <SearchSelect
            label="Which customer?"
            name="customerId"
            placeholder="Type a name to search"
            options={customers.map((customer) => ({ value: customer.id, label: customer.name }))}
            hint={
              reason === "customer_return"
                ? "This also takes the quantity off what they owe."
                : "This also adds the quantity to what they owe."
            }
          />
        ) : (
          <input type="hidden" name="customerId" value="" />
        )}
        <TextField label="Date" name="adjustmentDate" type="date" defaultValue={today} max={today} required />
        {locations.length > 1 ? (
          <SelectField label="At which location?" name="locationId" defaultValue={locations[0].id}>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <input type="hidden" name="locationId" value={locations[0]?.id ?? ""} />
        )}
      </div>
      <TextField
        label={reason === "correction" ? "Why is the count being corrected?" : "Note (optional)"}
        name="note"
        maxLength={500}
        required={reason === "correction"}
      />
      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save adjustment
      </SubmitButton>
    </form>
  );
}
