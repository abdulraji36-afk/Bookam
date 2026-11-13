"use client";

import { useState } from "react";
import { FormMessage } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { formatQuantity } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";

export type WaitingOrder = {
  id: string;
  orderNo: string;
  customerName: string;
  customerArea: string | null;
  totalQuantity: number;
  hasReturns: boolean;
  locationId: string;
};

type Props = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  orders: WaitingOrder[];
  locations: { id: string; name: string }[];
  today: string;
};

export function TripForm({ action, orders, locations, today }: Props) {
  const { state, pending, form } = useFormAction(action);
  const [locationId, setLocationId] = useState(
    // Start on the first location that actually has orders waiting.
    locations.find((location) => orders.some((order) => order.locationId === location.id))?.id ??
      locations[0]?.id ??
      ""
  );
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  const here = orders.filter((order) => order.locationId === locationId);
  const allChosen = here.length > 0 && here.every((order) => chosen.has(order.id));

  const toggle = (id: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <form {...form} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="Driver's name" name="driverName" autoComplete="off" maxLength={80} required />
        <TextField label="Vehicle (optional)" name="vehicle" placeholder="e.g. plate number" maxLength={80} />
        <TextField label="Dispatch date" name="dispatchDate" type="date" defaultValue={today} max={today} required />
        {locations.length > 1 ? (
          <SelectField
            label="Leaving from"
            name="locationId"
            value={locationId}
            onChange={(event) => {
              setLocationId(event.currentTarget.value);
              setChosen(new Set());
            }}
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <input type="hidden" name="locationId" value={locationId} />
        )}
      </div>

      <fieldset className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <legend className="float-left text-lg font-extrabold">
            Orders to load ({chosen.size} chosen)
          </legend>
          {here.length > 1 ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setChosen(allChosen ? new Set() : new Set(here.map((order) => order.id)))}
            >
              {allChosen ? "Clear all" : "Choose all"}
            </Button>
          ) : null}
        </div>

        {here.length === 0 ? (
          <p className="clear-both font-medium text-ink-soft">No orders are waiting at this location.</p>
        ) : (
          <ul className="clear-both divide-y divide-line rounded-md border-2 border-ink">
            {here.map((order) => (
              <li key={order.id}>
                <label className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    name="orderId"
                    value={order.id}
                    checked={chosen.has(order.id)}
                    onChange={() => toggle(order.id)}
                    className="size-6 shrink-0 accent-ink"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-extrabold">
                      {order.customerName}
                      {order.customerArea ? ` (${order.customerArea})` : ""}
                    </span>
                    <span className="text-sm font-medium text-ink-soft">
                      {order.orderNo} · {formatQuantity(order.totalQuantity)} items
                    </span>
                  </span>
                  {order.hasReturns ? <Badge tone="solid">Return due</Badge> : null}
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <TextField label="Note (optional)" name="note" maxLength={500} />
      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Create trip
      </SubmitButton>
    </form>
  );
}
