"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { FormMessage } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { SearchSelect } from "@/components/ui/search-select";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { formatMoney, formatQuantity, PAYMENT_LABELS } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";
import type { PaymentType } from "@/types/database";
import { CardRail } from "@/components/ui/card-rail";

export type BatchProduct = {
  id: string;
  name: string;
  unit: string;
  price: number | null;
  /** "RGB" for returnable crates, otherwise the product's category. */
  category: string;
};

type Card = { key: number; customerId: string; quantities: Record<string, string>; order: string[] };

type Props = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  customers: { id: string; name: string; area: string | null }[];
  products: BatchProduct[];
  locations: { id: string; name: string }[];
  /** On hand per location, then per product. */
  stock: Record<string, Record<string, number>>;
  currency: string;
  today: string;
};

const whole = (value: string | undefined) => {
  const number = Number.parseInt(value ?? "", 10);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

/**
 * Drinks orders for several customers in one go, the Bilikis way. Every
 * product tile shows the stock still free after what has been typed for
 * every customer on this screen:
 *
 *   Stock left = stock at the location − quantities entered on all cards
 */
export function BatchOrderForm({ action, customers, products, locations, stock, currency, today }: Props) {
  const { state, pending, form } = useFormAction(action);
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [category, setCategory] = useState("all");
  const nextKey = useRef(2);
  const [cards, setCards] = useState<Card[]>([{ key: 1, customerId: "", quantities: {}, order: [] }]);
  const [missing, setMissing] = useState<{ key: string; message: string } | null>(null);

  const onHand = (productId: string) => stock[locationId]?.[productId] ?? 0;
  const entered = (productId: string, exceptCard?: number) =>
    cards.reduce((sum, card) => (card.key === exceptCard ? sum : sum + whole(card.quantities[productId])), 0);
  const stockLeft = (productId: string) => Math.max(0, onHand(productId) - entered(productId));
  const maxFor = (card: Card, productId: string) => Math.max(0, onHand(productId) - entered(productId, card.key));

  const categories = useMemo(() => {
    const seen = new Set(products.map((product) => product.category));
    // The returnable category first: "RGB" for drinks, "Returnable" for goods.
    const first = [...seen].find((name) => name === "RGB" || name === "Returnable");
    return ["all", ...(first ? [first] : []), ...[...seen].filter((name) => name !== first).sort()];
  }, [products]);
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  function update(cardKey: number, change: (card: Card) => Card) {
    setCards((current) => current.map((card) => (card.key === cardKey ? change(card) : card)));
    setMissing(null);
  }
  function setQuantity(card: Card, productId: string, raw: string) {
    const digits = raw.replace(/\D/g, "");
    const clamped = digits === "" ? "" : String(Math.min(Number(digits), maxFor(card, productId)));
    update(card.key, (current) => ({
      ...current,
      quantities: { ...current.quantities, [productId]: clamped },
      order: current.order.includes(productId) ? current.order : [...current.order, productId]
    }));
  }
  function step(card: Card, productId: string, delta: number) {
    const next = Math.min(Math.max(0, whole(card.quantities[productId]) + delta), maxFor(card, productId));
    if (next === 0) {
      update(card.key, (current) => {
        const quantities = { ...current.quantities };
        delete quantities[productId];
        return { ...current, quantities, order: current.order.filter((id) => id !== productId) };
      });
      return;
    }
    setQuantity(card, productId, String(next));
  }
  function start(card: Card, productId: string) {
    update(card.key, (current) => ({
      ...current,
      quantities: { ...current.quantities, [productId]: current.quantities[productId] ?? "" },
      order: current.order.includes(productId) ? current.order : [...current.order, productId]
    }));
  }
  function addCard() {
    const key = nextKey.current++;
    setCards((current) => [...current, { key, customerId: "", quantities: {}, order: [] }]);
  }

  const lines = (card: Card) =>
    card.order
      .map((productId) => ({ product: productById.get(productId), quantity: whole(card.quantities[productId]) }))
      .filter((line): line is { product: BatchProduct; quantity: number } => Boolean(line.product) && line.quantity > 0);
  const customerName = (id: string) => customers.find((customer) => customer.id === id)?.name;
  const totalQuantity = cards.reduce((sum, card) => sum + lines(card).reduce((total, line) => total + line.quantity, 0), 0);
  const totalAmount = cards.reduce(
    (sum, card) => sum + lines(card).reduce((total, line) => total + line.quantity * (line.product.price ?? 0), 0),
    0
  );
  const payload = JSON.stringify(
    cards.map((card) => ({
      customer_id: card.customerId,
      items: lines(card).map((line) => ({ product_id: line.product.id, quantity: line.quantity }))
    }))
  );

  function firstMissing() {
    for (const [index, card] of cards.entries()) {
      const label = customerName(card.customerId) ?? `customer ${index + 1}`;
      if (!card.customerId) return { key: `customer-${card.key}`, message: `Choose customer ${index + 1} before saving.` };
      if (lines(card).length === 0) return { key: `products-${card.key}`, message: `Add at least one product for ${label}.` };
    }
    return null;
  }
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const problem = firstMissing();
    if (problem) {
      event.preventDefault();
      setMissing(problem);
      const box = form.ref.current?.querySelector(`[data-field="${problem.key}"]`);
      box?.scrollIntoView({ block: "center", behavior: "smooth" });
      box?.querySelector<HTMLElement>("input:not([type=hidden]), button")?.focus({ preventScroll: true });
      return;
    }
    form.onSubmit(event);
  }
  const note = (key: string) =>
    missing?.key === key ? (
      <p role="alert" className="mt-2 rounded-md border-2 border-danger bg-danger-soft px-3 py-2 text-sm font-bold text-danger">
        {missing.message}
      </p>
    ) : null;
  const noEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.preventDefault();
  };

  return (
    <form {...form} onSubmit={onSubmit} className="space-y-6">
      <input type="hidden" name="orders" value={payload} />

      <div className="grid gap-4 rounded-md bg-white p-5 sm:grid-cols-2">
        <TextField label="Order date" name="orderDate" type="date" defaultValue={today} max={today} required />
        {locations.length > 1 ? (
          <SelectField
            label="Stock comes from"
            name="locationId"
            value={locationId}
            onChange={(event) => {
              setLocationId(event.currentTarget.value);
              setCards((current) => current.map((card) => ({ ...card, quantities: {}, order: [] })));
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
        <SelectField label="Payment" name="paymentType" defaultValue="cash">
          {(Object.entries(PAYMENT_LABELS) as [PaymentType, string][]).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <TextField label="Note (optional)" name="note" maxLength={500} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold">Customers</h2>
              <p className="text-sm font-medium text-ink-soft">Add one or more customers. Each customer can be on the list once.</p>
            </div>
            <Button type="button" variant="primary" onClick={addCard}>
              <Plus aria-hidden className="size-4" /> Add customer
            </Button>
          </div>

          {categories.length > 2 ? (
            <div role="group" aria-label="Show products" className="flex flex-wrap gap-2">
              {categories.map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={category === name}
                  onClick={() => setCategory(name)}
                  className={`min-h-10 rounded-full border-2 px-4 text-sm font-bold ${
                    category === name ? "border-ink bg-ink text-white" : "border-field bg-white text-ink"
                  }`}
                >
                  {name === "all" ? "All" : name}
                </button>
              ))}
            </div>
          ) : null}

          {cards.map((card, index) => {
            const visible = products.filter(
              (product) =>
                (category === "all" || product.category === category) &&
                (onHand(product.id) > 0 || card.order.includes(product.id))
            );
            const taken = new Set(cards.filter((other) => other.key !== card.key).map((other) => other.customerId));
            return (
              <section
                key={card.key}
                aria-label={`Customer ${index + 1}`}
                className="min-w-0 overflow-hidden rounded-md border-2 border-line bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-lg font-extrabold">Customer {index + 1}</p>
                  {cards.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setCards((current) => current.filter((other) => other.key !== card.key))}
                    >
                      <Trash2 aria-hidden className="size-4" /> Remove
                    </Button>
                  ) : null}
                </div>
                <div data-field={`customer-${card.key}`} className="mt-3">
                  <SearchSelect
                    label="Customer"
                    name={`customer-${card.key}`}
                    placeholder="Type a name to search"
                    value={card.customerId}
                    onChange={(customerId) => update(card.key, (current) => ({ ...current, customerId }))}
                    options={customers.map((customer) => ({
                      value: customer.id,
                      label: customer.name,
                      detail: customer.area ?? undefined,
                      disabled: taken.has(customer.id)
                    }))}
                  />
                  {note(`customer-${card.key}`)}
                </div>

                <div data-field={`products-${card.key}`} className="mt-4">
                  {visible.length === 0 ? (
                    <p className="text-sm font-medium text-ink-soft">No products in stock here.</p>
                  ) : (
                    <CardRail label="products">
                      <ul className="flex w-max gap-3">
                        {visible.map((product) => {
                          const active = card.order.includes(product.id);
                          const left = stockLeft(product.id);
                          const canStart = maxFor(card, product.id) > 0;
                          return (
                            <li
                              key={product.id}
                              className={`flex w-52 shrink-0 flex-col overflow-hidden rounded-md border-2 ${
                                active ? "border-ink" : "border-line"
                              } bg-white`}
                            >
                              <p className="flex items-center justify-between gap-2 bg-canvas px-3 py-2 text-sm font-bold">
                                <span className="tabular-nums" aria-label={`Stock left for ${product.name}`}>
                                  Stock left: {formatQuantity(left)}
                                </span>
                                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-extrabold">{product.category}</span>
                              </p>
                              <div className="flex flex-1 flex-col gap-1 px-3 py-3">
                                <p className="line-clamp-2 min-h-11 font-extrabold leading-snug">{product.name}</p>
                                <p className="text-sm font-medium text-ink-soft">
                                  {product.price === null ? "No price" : `${formatMoney(product.price, currency)} a ${product.unit}`}
                                </p>
                              </div>
                              <div className="border-t border-line p-3">
                                {active ? (
                                  <div className="flex items-center gap-1 rounded-full bg-canvas p-1">
                                    <button
                                      type="button"
                                      onClick={() => step(card, product.id, -1)}
                                      aria-label={`Fewer ${product.name}`}
                                      className="grid size-10 place-items-center rounded-full bg-ink text-white"
                                    >
                                      <Minus aria-hidden className="size-4" />
                                    </button>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      enterKeyHint="done"
                                      aria-label={`${product.name} for customer ${index + 1}`}
                                      autoComplete="off"
                                      placeholder="0"
                                      value={card.quantities[product.id] ?? ""}
                                      onChange={(event) => setQuantity(card, product.id, event.currentTarget.value)}
                                      onKeyDown={noEnter}
                                      className="h-10 min-w-0 flex-1 bg-transparent text-center text-lg font-extrabold tabular-nums outline-none"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => step(card, product.id, 1)}
                                      disabled={left === 0}
                                      aria-label={`More ${product.name}`}
                                      className="grid size-10 place-items-center rounded-full bg-ink text-white disabled:opacity-40"
                                    >
                                      <Plus aria-hidden className="size-4" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => start(card, product.id)}
                                    disabled={!canStart}
                                    aria-label={canStart ? `Add ${product.name} for customer ${index + 1}` : `${product.name}: no stock left`}
                                    className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-full bg-ink px-4 text-sm font-bold text-white disabled:opacity-40"
                                  >
                                    {canStart ? (
                                      <>
                                        Add <Plus aria-hidden className="size-4" />
                                      </>
                                    ) : (
                                      "No stock left"
                                    )}
                                  </button>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </CardRail>
                  )}
                  {note(`products-${card.key}`)}
                </div>
              </section>
            );
          })}
        </div>

        <aside className="h-fit space-y-4 rounded-md bg-white p-5 xl:sticky xl:top-6">
          <div>
            <h2 className="text-xl font-extrabold">On this list</h2>
            <p className="text-sm font-medium text-ink-soft">Check each customer before saving.</p>
          </div>
          {totalQuantity === 0 ? (
            <p className="rounded-md bg-canvas px-4 py-3 text-sm font-medium text-ink-soft">No products added yet. Tap Add on a product.</p>
          ) : (
            <ul className="space-y-3">
              {cards
                .filter((card) => lines(card).length > 0)
                .map((card) => (
                  <li key={card.key} className="rounded-md bg-canvas px-4 py-3">
                    <p className="font-extrabold">{customerName(card.customerId) ?? "Customer not chosen"}</p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {lines(card).map((line) => (
                        <li key={line.product.id} className="flex justify-between gap-3">
                          <span className="text-ink-soft">{line.product.name}</span>
                          <span className="font-extrabold tabular-nums">{formatQuantity(line.quantity)}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
            </ul>
          )}
          <dl className="rounded-md bg-ink px-4 py-3 text-white">
            <dt className="text-xs font-bold uppercase tracking-wide text-nav">Total quantity</dt>
            <dd className="text-3xl font-extrabold tabular-nums">{formatQuantity(totalQuantity)}</dd>
            {totalAmount > 0 ? (
              <dd className="text-sm font-bold text-nav">{formatMoney(totalAmount, currency)}</dd>
            ) : null}
          </dl>
          <FormMessage state={state} />
          <SubmitButton pending={pending} pendingLabel="Saving…">
            {cards.length > 1 ? `Save ${cards.length} orders` : "Save order"}
          </SubmitButton>
        </aside>
      </div>
    </form>
  );
}
