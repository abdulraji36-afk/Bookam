"use client";

import { useRef, useState } from "react";
import { FormMessage } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { formatMoney, formatQuantity, PAYMENT_LABELS } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";
import type { PaymentType } from "@/types/database";

export type OrderFormProduct = { id: string; name: string; unit: string; price: number | null };

type Line = { key: number; productId: string; quantity: string };

type Props = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  customers: { id: string; name: string; area: string | null }[];
  products: OrderFormProduct[];
  locations: { id: string; name: string }[];
  /** Stock on hand: location id -> product id -> quantity. */
  stock: Record<string, Record<string, number>>;
  currency: string;
  today: string;
  /** Set when editing: the order's saved values. The location cannot change. */
  editing?: {
    locationId: string;
    orderDate: string;
    customerId: string;
    paymentType: PaymentType;
    note: string;
    lines: { productId: string; quantity: number }[];
  };
};

export function OrderForm({ action, customers, products, locations, stock, currency, today, editing }: Props) {
  const { state, pending, form } = useFormAction(action);
  const nextKey = useRef(editing ? editing.lines.length : 1);
  const [locationId, setLocationId] = useState(editing?.locationId ?? locations[0]?.id ?? "");
  const [lines, setLines] = useState<Line[]>(
    editing
      ? editing.lines.map((line, index) => ({ key: index, productId: line.productId, quantity: String(line.quantity) }))
      : [{ key: 0, productId: "", quantity: "" }]
  );

  const productById = new Map(products.map((product) => [product.id, product]));
  // While editing, the order's own lines are already taken out of stock, so add them back.
  const heldByOrder = new Map(editing?.lines.map((line) => [line.productId, line.quantity]));
  const available = (productId: string) =>
    (stock[locationId]?.[productId] ?? 0) + (heldByOrder.get(productId) ?? 0);

  const setLine = (key: number, change: Partial<Line>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...change } : line)));

  const total = lines.reduce((sum, line) => {
    const price = productById.get(line.productId)?.price ?? 0;
    const quantity = Number(line.quantity);
    return sum + (Number.isFinite(quantity) ? quantity * price : 0);
  }, 0);

  return (
    <form {...form} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField label="Customer" name="customerId" defaultValue={editing?.customerId ?? ""} required>
          <option value="">Choose a customer</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
              {customer.area ? ` (${customer.area})` : ""}
            </option>
          ))}
        </SelectField>
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
        <legend className="text-lg font-extrabold uppercase tracking-wide">Products</legend>
        {lines.map((line, index) => {
          const product = productById.get(line.productId);
          const inStock = product ? available(product.id) : null;
          const tooMany = inStock !== null && Number(line.quantity) > inStock;

          return (
            <div key={line.key} className="space-y-1">
              <div className="grid grid-cols-[1fr_auto] items-end gap-2 sm:grid-cols-[1fr_7rem_auto] sm:gap-3">
                <div className="col-span-2 sm:col-span-1">
                <SelectField
                  label={index === 0 ? "Product" : `Product ${index + 1}`}
                  name="productId"
                  value={line.productId}
                  onChange={(event) => setLine(line.key, { productId: event.currentTarget.value })}
                >
                  <option value="">Choose a product</option>
                  {products.map((option) => (
                    <option key={option.id} value={option.id} disabled={option.price === null}>
                      {option.name} ({option.unit})
                      {option.price === null ? " · no price set" : ` · ${formatMoney(option.price, currency)}`}
                    </option>
                  ))}
                </SelectField>
                </div>
                <TextField
                  label="Quantity"
                  name="quantity"
                  inputMode="decimal"
                  autoComplete="off"
                  value={line.quantity}
                  onChange={(event) => setLine(line.key, { quantity: event.currentTarget.value })}
                />
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
              {product && inStock !== null ? (
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
            setLines((current) => [...current, { key: nextKey.current++, productId: "", quantity: "" }])
          }
        >
          Add another product
        </Button>
      </fieldset>

      <p className="flex items-baseline justify-between gap-3 border-t-[3px] border-ink pt-3">
        <span className="text-lg font-extrabold uppercase tracking-wide">Order total</span>
        <span className="text-3xl font-extrabold tabular-nums">{formatMoney(total, currency)}</span>
      </p>

      <TextField label="Note (optional)" name="note" defaultValue={editing?.note} maxLength={500} />
      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        {editing ? "Save changes" : "Save order"}
      </SubmitButton>
    </form>
  );
}
