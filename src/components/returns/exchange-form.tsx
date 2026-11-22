"use client";

import { useSay } from "@/components/business/words-context";
import { FormMessage } from "@/components/ui/alert";
import { SelectField, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { formatQuantity } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";

export type Choice = { id: string; name: string };

type Props = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  returnables: Choice[];
  locations: Choice[];
  today: string;
  /** A drinks business records it the Bilikis way: the supplier's reference required, RGB crates delivered. */
  drinks?: boolean;
  /** How many are in store now, per location. */
  inStore?: Record<string, number>;
};

export function ExchangeForm({
  action,
  returnables,
  locations,
  today,
  drinks,
  inStore,
}: Props) {
  const t = useSay();
  const { state, pending, form } = useFormAction(action);
  const name = returnables.length === 1 ? returnables[0].name : "";
  const inStoreHint =
    inStore && locations.length === 1 && inStore[locations[0].id] !== undefined
      ? `In store now: ${formatQuantity(inStore[locations[0].id])}.`
      : undefined;

  return (
    <form {...form} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Date"
          name="exchangeDate"
          type="date"
          defaultValue={today}
          max={today}
          required
        />
        {locations.length > 1 ? (
          <SelectField
            label="Taken from"
            name="locationId"
            defaultValue={locations[0].id}
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <input
            type="hidden"
            name="locationId"
            value={locations[0]?.id ?? ""}
          />
        )}
        <TextField
          label={
            drinks
              ? "Supplier delivery reference"
              : "Delivery reference (optional)"
          }
          name="reference"
          maxLength={80}
          placeholder={drinks ? "e.g. the waybill number" : undefined}
          required={drinks}
        />
        <TextField
          label="Supplier (optional)"
          name="supplierName"
          maxLength={80}
          placeholder={drinks ? "e.g. NBC or Nigerian Breweries" : undefined}
        />
        {drinks ? (
          <TextField
            label={t("RGB crates delivered (optional)")}
            name="cratesDelivered"
            inputMode="numeric"
            autoComplete="off"
            hint={t("For the record only. It does not change stock or empties.")}
          />
        ) : (
          <input type="hidden" name="cratesDelivered" value="" />
        )}
        {returnables.length > 1 ? (
          <SelectField
            label="What did the supplier take?"
            name="returnableItemId"
            defaultValue={returnables[0].id}
          >
            {returnables.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <input
            type="hidden"
            name="returnableItemId"
            value={returnables[0]?.id ?? ""}
          />
        )}
        <TextField
          label={
            name
              ? `${name} taken by the supplier`
              : "How many did the supplier take?"
          }
          name="quantity"
          inputMode="numeric"
          autoComplete="off"
          hint={
            inStoreHint
              ? `Only this number comes off your store count. ${inStoreHint}`
              : "Only this number comes off your store count."
          }
          required
        />
        <TextField
          label="Received by (optional)"
          name="receivedBy"
          maxLength={80}
        />
      </div>
      <TextField label="Note (optional)" name="note" maxLength={500} />
      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save exchange
      </SubmitButton>
    </form>
  );
}
