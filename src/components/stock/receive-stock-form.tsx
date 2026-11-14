"use client";

import { useRef, useState } from "react";
import { FormMessage } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { SearchSelect } from "@/components/ui/search-select";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { CONDITION_LABELS } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";
import type { UnitCondition } from "@/types/database";

export type ReceiveProduct = {
  id: string;
  name: string;
  unit: string;
  tracksSerials: boolean;
  /** Colours already used for this product, offered as suggestions. */
  colours: string[];
};

type Props = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  products: ReceiveProduct[];
  locations: { id: string; name: string }[];
  today: string;
};

type Unit = { key: number; serial: string; colour: string; condition: UnitCondition };
type Line = { key: number; productId: string; units: Unit[] };

export function ReceiveStockForm({ action, products, locations, today }: Props) {
  const { state, pending, form } = useFormAction(action);
  const nextKey = useRef(1);
  const [lines, setLines] = useState<Line[]>([{ key: 0, productId: "", units: [] }]);
  const productById = new Map(products.map((product) => [product.id, product]));
  // Lets a new serial box take the cursor, so a barcode scanner can keep going.
  const focusSerial = useRef<number | null>(null);

  const newUnit = (from?: Unit): Unit => ({
    key: nextKey.current++,
    serial: "",
    colour: from?.colour ?? "",
    condition: from?.condition ?? "brand_new"
  });

  const updateLine = (key: number, change: (line: Line) => Line) =>
    setLines((current) => current.map((line) => (line.key === key ? change(line) : line)));

  function addUnit(lineKey: number, after?: Unit) {
    const unit = newUnit(after);
    focusSerial.current = unit.key;
    updateLine(lineKey, (line) => ({ ...line, units: [...line.units, unit] }));
  }

  return (
    <form {...form} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="Date the stock arrived" name="receivedDate" type="date" defaultValue={today} max={today} required />
        {locations.length > 1 ? (
          <SelectField label="Received at" name="locationId" defaultValue={locations[0].id}>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <input type="hidden" name="locationId" value={locations[0]?.id ?? ""} />
        )}
        <TextField label="Supplier (optional)" name="supplierName" maxLength={80} />
        <TextField
          label="Delivery reference (optional)"
          name="reference"
          hint="A waybill or invoice number, if there is one."
          maxLength={80}
        />
      </div>

      <fieldset className="space-y-5">
        <legend className="text-lg font-extrabold">Products received</legend>
        {lines.map((line, index) => {
          const product = productById.get(line.productId);
          const tracked = product?.tracksSerials ?? false;
          const entered = line.units.filter((unit) => unit.serial.trim() !== "").length;
          const colourList = `colours-${line.key}`;

          return (
            <div key={line.key} className="space-y-3 rounded-md border-2 border-line p-3 sm:border-0 sm:p-0">
              <input type="hidden" name="lineKey" value={line.key} />
              <input type="hidden" name="tracked" value={tracked ? "1" : "0"} />
              <div className="grid grid-cols-[1fr_auto] items-end gap-2 sm:grid-cols-[1fr_7rem_auto] sm:gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <SearchSelect
                    label={index === 0 ? "Product" : `Product ${index + 1}`}
                    name="productId"
                    placeholder="Type a product to search"
                    value={line.productId}
                    onChange={(productId) => {
                      const chosen = productById.get(productId);
                      updateLine(line.key, (current) => ({
                        ...current,
                        productId,
                        // A serial-numbered product starts with one empty phone line.
                        units: chosen?.tracksSerials ? (current.units.length ? current.units : [newUnit()]) : []
                      }));
                    }}
                    options={products.map((option) => ({
                      value: option.id,
                      label: `${option.name} (${option.unit})`,
                      detail: option.tracksSerials ? "Serial numbers" : undefined
                    }))}
                  />
                </div>
                {tracked ? (
                  <div>
                    <p className="mb-1.5 text-sm font-bold">Quantity</p>
                    <p className="flex min-h-12 items-center rounded-md bg-chip px-3 font-extrabold tabular-nums" aria-live="polite">
                      {entered}
                    </p>
                    <input type="hidden" name="quantity" value="" />
                  </div>
                ) : (
                  <TextField label="Quantity" name="quantity" inputMode="decimal" autoComplete="off" />
                )}
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  className="min-h-12"
                  disabled={lines.length === 1}
                  aria-label={`Remove line ${index + 1}`}
                  onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                >
                  Remove
                </Button>
              </div>

              {tracked && product ? (
                <div className="space-y-2 rounded-md bg-paper p-3">
                  <p className="text-sm font-semibold text-ink-soft">
                    One line per {product.unit}. A barcode scanner works in the serial box: each scan starts the next line.
                  </p>
                  <datalist id={colourList}>
                    {product.colours.map((colour) => (
                      <option key={colour} value={colour} />
                    ))}
                  </datalist>
                  {line.units.map((unit, unitIndex) => {
                    const set = (change: Partial<Unit>) =>
                      updateLine(line.key, (current) => ({
                        ...current,
                        units: current.units.map((item) => (item.key === unit.key ? { ...item, ...change } : item))
                      }));
                    return (
                      <div
                        key={unit.key}
                        className="grid grid-cols-2 items-end gap-2 border-b border-line pb-3 last:border-0 last:pb-0 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:border-0 sm:pb-0"
                      >
                        <input type="hidden" name="unitLine" value={line.key} />
                        <div className="col-span-2 sm:col-span-1">
                          <TextField
                            label={`Serial / IMEI ${unitIndex + 1}`}
                            name="serial"
                            value={unit.serial}
                            autoComplete="off"
                            autoCapitalize="characters"
                            spellCheck={false}
                            maxLength={60}
                            ref={(input) => {
                              if (input && focusSerial.current === unit.key) {
                                focusSerial.current = null;
                                input.focus();
                              }
                            }}
                            onChange={(event) => set({ serial: event.currentTarget.value })}
                            onKeyDown={(event) => {
                              // Scanners press Enter after each code: start the next line instead of saving.
                              if (event.key === "Enter") {
                                event.preventDefault();
                                if (unit.serial.trim() !== "") addUnit(line.key, unit);
                              }
                            }}
                          />
                        </div>
                        <TextField
                          label="Colour"
                          name="colour"
                          list={colourList}
                          value={unit.colour}
                          maxLength={30}
                          autoComplete="off"
                          onChange={(event) => set({ colour: event.currentTarget.value })}
                        />
                        <SelectField
                          label="Condition"
                          name="condition"
                          value={unit.condition}
                          onChange={(event) => set({ condition: event.currentTarget.value as UnitCondition })}
                        >
                          {Object.entries(CONDITION_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </SelectField>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="col-span-2 min-h-12 text-danger sm:col-span-1"
                          disabled={line.units.length === 1}
                          aria-label={`Remove serial ${unitIndex + 1}`}
                          onClick={() =>
                            updateLine(line.key, (current) => ({
                              ...current,
                              units: current.units.filter((item) => item.key !== unit.key)
                            }))
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    );
                  })}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => addUnit(line.key, line.units[line.units.length - 1])}
                  >
                    + Add another {product.unit}
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setLines((current) => [...current, { key: nextKey.current++, productId: "", units: [] }])}
        >
          Add another product
        </Button>
      </fieldset>

      <TextField label="Note (optional)" name="note" maxLength={500} />
      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save and add to stock
      </SubmitButton>
    </form>
  );
}
