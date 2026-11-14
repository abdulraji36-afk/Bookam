"use client";

import { useRef, useState } from "react";
import { FormMessage } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { UnitPicker, type PickableUnit } from "@/components/orders/unit-picker";
import { Alert } from "@/components/ui/alert";
import { CheckboxField, SelectField, TextField } from "@/components/ui/field";
import { SearchSelect } from "@/components/ui/search-select";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { formatMoney, formatQuantity, PAYMENT_LABELS } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";
import type { PaymentType } from "@/types/database";

export type OrderFormProduct = {
  id: string;
  name: string;
  unit: string;
  price: number | null;
  tracksSerials: boolean;
  /** Customers must bring something back for this product. */
  returnable: boolean;
};

type Line = { key: number; productId: string; quantity: string; unitIds: Set<string> };

type Props = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  customers: { id: string; name: string; area: string | null }[];
  products: OrderFormProduct[];
  locations: { id: string; name: string }[];
  /** Stock on hand: location id -> product id -> quantity. */
  stock: Record<string, Record<string, number>>;
  /** Serial-numbered units that can be chosen (in stock, or already on this order). */
  units: PickableUnit[];
  currency: string;
  today: string;
  /** Set when editing: the order's saved values. The location cannot change. */
  editing?: {
    locationId: string;
    orderDate: string;
    customerId: string | null;
    buyerName: string;
    buyerPhone: string;
    paymentType: PaymentType;
    note: string;
    lines: { productId: string; quantity: number; unitIds: string[] }[];
  };
};

export function OrderForm({ action, customers, products, locations, stock, units, currency, today, editing }: Props) {
  const { state, pending, form } = useFormAction(action);
  const nextKey = useRef(editing ? editing.lines.length : 1);
  const [locationId, setLocationId] = useState(editing?.locationId ?? locations[0]?.id ?? "");
  // With no saved customers yet, every sale is to a walk-in buyer.
  const [walkIn, setWalkIn] = useState(editing ? editing.customerId === null : customers.length === 0);
  const [leaving, setLeaving] = useState<"trip" | "now">(!editing && customers.length === 0 ? "now" : "trip");
  const [lines, setLines] = useState<Line[]>(
    editing
      ? editing.lines.map((line, index) => ({
          key: index,
          productId: line.productId,
          quantity: String(line.quantity),
          unitIds: new Set(line.unitIds)
        }))
      : [{ key: 0, productId: "", quantity: "", unitIds: new Set() }]
  );

  const productById = new Map(products.map((product) => [product.id, product]));
  // While editing, the order's own lines are already taken out of stock, so add them back.
  const heldByOrder = new Map(editing?.lines.map((line) => [line.productId, line.quantity]));
  const available = (productId: string) =>
    (stock[locationId]?.[productId] ?? 0) + (heldByOrder.get(productId) ?? 0);

  const setLine = (key: number, change: Partial<Line>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...change } : line)));

  const quantityOf = (line: Line) =>
    productById.get(line.productId)?.tracksSerials ? line.unitIds.size : Number(line.quantity);
  const total = lines.reduce((sum, line) => {
    const price = productById.get(line.productId)?.price ?? 0;
    const quantity = quantityOf(line);
    return sum + (Number.isFinite(quantity) ? quantity * price : 0);
  }, 0);
  const returnableChosen = lines.some((line) => productById.get(line.productId)?.returnable);

  function toggleUnit(lineKey: number, unitId: string) {
    setLines((current) =>
      current.map((line) => {
        if (line.key !== lineKey) return line;
        const unitIds = new Set(line.unitIds);
        if (unitIds.has(unitId)) unitIds.delete(unitId);
        else unitIds.add(unitId);
        return { ...line, unitIds };
      })
    );
  }

  return (
    <form {...form} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-3 sm:col-span-2">
          <CheckboxField
            label="Walk-in buyer"
            name="walkIn"
            checked={walkIn}
            onChange={(event) => {
              const checked = event.currentTarget.checked;
              setWalkIn(checked);
              // A walk-in buyer almost always takes the goods there and then.
              if (!editing) setLeaving(checked ? "now" : "trip");
            }}
            hint="Someone who is not a saved customer. Their name and phone are kept on the order for warranty."
          />
          {walkIn ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField label="Buyer's name (optional)" name="buyerName" defaultValue={editing?.buyerName} maxLength={80} autoComplete="off" />
              <TextField
                label="Buyer's phone (optional)"
                name="buyerPhone"
                type="tel"
                inputMode="tel"
                defaultValue={editing?.buyerPhone}
                maxLength={30}
                autoComplete="off"
              />
              <input type="hidden" name="customerId" value="" />
            </div>
          ) : (
            <SearchSelect
              label="Customer"
              name="customerId"
              placeholder="Type a name to search"
              defaultValue={editing?.customerId ?? ""}
              options={customers.map((customer) => ({
                value: customer.id,
                label: customer.name,
                detail: customer.area ?? undefined
              }))}
            />
          )}
        </div>
        <TextField
          label="Order date"
          name="orderDate"
          type="date"
          defaultValue={editing?.orderDate ?? today}
          max={today}
          required
        />
        <SelectField label="Payment" name="paymentType" defaultValue={editing?.paymentType ?? "cash"}>
          {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        {locations.length > 1 && !editing ? (
          <SelectField
            label="Take stock from"
            name="locationId"
            value={locationId}
            onChange={(event) => setLocationId(event.currentTarget.value)}
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
        <legend className="text-lg font-extrabold">Products</legend>
        {lines.map((line, index) => {
          const product = productById.get(line.productId);
          const tracked = product?.tracksSerials ?? false;
          const inStock = product ? available(product.id) : null;
          const tooMany = !tracked && inStock !== null && Number(line.quantity) > inStock;
          const lineUnits = units.filter((unit) => unit.productId === line.productId && unit.locationId === locationId);

          return (
            <div key={line.key} className="space-y-2">
              <input type="hidden" name="lineKey" value={line.key} />
              <input type="hidden" name="tracked" value={tracked ? "1" : "0"} />
              <div className="grid grid-cols-[1fr_auto] items-end gap-2 sm:grid-cols-[1fr_7rem_auto] sm:gap-3">
                <div className="col-span-2 sm:col-span-1">
                <SearchSelect
                  label={index === 0 ? "Product" : `Product ${index + 1}`}
                  name="productId"
                  placeholder="Type a product to search"
                  value={line.productId}
                  onChange={(productId) => setLine(line.key, { productId, unitIds: new Set() })}
                  options={products.map((option) => ({
                    value: option.id,
                    label: `${option.name} (${option.unit})`,
                    detail:
                      option.price === null
                        ? "No price set yet"
                        : `${formatMoney(option.price, currency)} · ${formatQuantity(available(option.id))} in stock`,
                    // A walk-in buyer cannot take something that must be brought back.
                    disabled: option.price === null || (walkIn && option.returnable)
                  }))}
                />
                </div>
                {tracked ? (
                  <div>
                    <p className="mb-1.5 text-sm font-bold">Quantity</p>
                    <p className="flex min-h-12 items-center rounded-md bg-chip px-3 font-extrabold tabular-nums" aria-live="polite">
                      {line.unitIds.size}
                    </p>
                    <input type="hidden" name="quantity" value="" />
                  </div>
                ) : (
                  <TextField
                    label="Quantity"
                    name="quantity"
                    inputMode="decimal"
                    autoComplete="off"
                    value={line.quantity}
                    onChange={(event) => setLine(line.key, { quantity: event.currentTarget.value })}
                  />
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
                <UnitPicker
                  lineKey={line.key}
                  units={lineUnits}
                  chosen={line.unitIds}
                  onToggle={(unitId) => toggleUnit(line.key, unitId)}
                  unitWord={product.unit}
                />
              ) : null}
              {!tracked && product && inStock !== null ? (
                <p className={`text-sm font-semibold ${tooMany ? "text-danger" : "text-ink-soft"}`}>
                  {formatQuantity(inStock)} {product.unit} in stock
                  {tooMany ? ". That is more than you have." : ""}
                </p>
              ) : null}
            </div>
          );
        })}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            setLines((current) => [...current, { key: nextKey.current++, productId: "", quantity: "", unitIds: new Set() }])
          }
        >
          Add another product
        </Button>
      </fieldset>

      {walkIn && returnableChosen ? (
        <Alert tone="error">
          A product on this order must be brought back, so it can only be sold to a saved customer. Untick Walk-in
          buyer, or remove that product.
        </Alert>
      ) : null}

      {!editing ? (
        <fieldset>
          <legend className="mb-1.5 text-sm font-bold">How is it leaving?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["now", "Customer takes it now", "Completed straight away. No trip needed."],
                ["trip", "Deliver on a trip", "Waits for dispatch until it goes out on a trip."]
              ] as const
            ).map(([value, label, hint]) => (
              <label
                key={value}
                className={`flex cursor-pointer gap-3 rounded-md border-2 p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
                  leaving === value ? "border-ink bg-paper" : "border-line bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="leaving"
                  value={value}
                  checked={leaving === value}
                  onChange={() => setLeaving(value)}
                  className="mt-1 size-5 shrink-0 accent-ink"
                />
                <span>
                  <span className="block font-extrabold">{label}</span>
                  <span className="text-sm text-ink-soft">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <p className="flex items-baseline justify-between gap-3 border-t-[3px] border-ink pt-3">
        <span className="text-lg font-extrabold">Order total</span>
        <span className="text-3xl font-extrabold tabular-nums">{formatMoney(total, currency)}</span>
      </p>

      <TextField label="Note (optional)" name="note" defaultValue={editing?.note} maxLength={500} />
      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        {editing ? "Save changes" : leaving === "now" ? "Save and complete sale" : "Save order"}
      </SubmitButton>
    </form>
  );
}
