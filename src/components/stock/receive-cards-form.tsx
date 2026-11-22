"use client";

import { Minus, Plus, X } from "lucide-react";
import { useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { FormMessage } from "@/components/ui/alert";
import { SelectField, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { formatQuantity } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";

export type ReceiveCardProduct = {
  id: string;
  name: string;
  unit: string;
  /** "RGB" for returnable crates, otherwise the product's category. */
  category: string;
  /** The product's picture (or its letters), drawn on the server. */
  picture: ReactNode;
};

type Props = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  products: ReceiveCardProduct[];
  locations: { id: string; name: string }[];
  /** On hand per location, then per product. */
  stock: Record<string, Record<string, number>>;
  today: string;
};

const whole = (value: string | undefined) => {
  const number = Number.parseInt(value ?? "", 10);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

/**
 * Stock in for a drinks depot, laid out like the order screen: every product
 * is a card in a row that scrolls sideways, with Add and then − / number / +.
 * What has been added is listed under "On this delivery" before saving.
 */
export function ReceiveCardsForm({ action, products, locations, stock, today }: Props) {
  const { state, pending, form } = useFormAction(action);
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [category, setCategory] = useState("all");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [missing, setMissing] = useState(false);

  const onHand = (productId: string) => stock[locationId]?.[productId] ?? 0;
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const categories = useMemo(() => {
    const seen = new Set(products.map((product) => product.category));
    return ["all", ...(seen.has("RGB") ? ["RGB"] : []), ...[...seen].filter((name) => name !== "RGB").sort()];
  }, [products]);
  const visible = products.filter((product) => category === "all" || product.category === category);

  function setQuantity(productId: string, raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 7);
    setQuantities((current) => ({ ...current, [productId]: digits }));
    setOrder((current) => (current.includes(productId) ? current : [...current, productId]));
    setMissing(false);
  }
  function remove(productId: string) {
    setQuantities((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
    setOrder((current) => current.filter((id) => id !== productId));
  }
  function step(productId: string, delta: number) {
    const next = Math.max(0, whole(quantities[productId]) + delta);
    if (next === 0) remove(productId);
    else setQuantity(productId, String(next));
  }

  const lines = order
    .map((productId) => ({ product: productById.get(productId), quantity: whole(quantities[productId]) }))
    .filter((line): line is { product: ReceiveCardProduct; quantity: number } => Boolean(line.product) && line.quantity > 0);
  const total = lines.reduce((sum, line) => sum + line.quantity, 0);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (lines.length === 0) {
      event.preventDefault();
      setMissing(true);
      form.ref.current?.querySelector("[data-field=products]")?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    form.onSubmit(event);
  }
  const noEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.preventDefault();
  };

  return (
    <form {...form} onSubmit={onSubmit} className="space-y-6">
      {/* The same fields the line-by-line form sends, one line per product added. */}
      {lines.map((line) => (
        <span key={line.product.id} hidden>
          <input type="hidden" name="lineKey" value={line.product.id} />
          <input type="hidden" name="tracked" value="0" />
          <input type="hidden" name="productId" value={line.product.id} />
          <input type="hidden" name="quantity" value={line.quantity} />
        </span>
      ))}

      <div className="grid gap-4 rounded-md bg-white p-5 sm:grid-cols-2">
        <TextField label="Date the stock arrived" name="receivedDate" type="date" defaultValue={today} max={today} required />
        {locations.length > 1 ? (
          <SelectField label="Received at" name="locationId" value={locationId} onChange={(event) => setLocationId(event.currentTarget.value)}>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <input type="hidden" name="locationId" value={locationId} />
        )}
        <TextField label="Supplier" name="supplierName" maxLength={80} placeholder="e.g. NBC or Nigerian Breweries" />
        <TextField
          label="Supplier delivery reference"
          name="reference"
          hint="The supplier's delivery reference on the waybill."
          maxLength={80}
          required
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-label="Products received" data-field="products" className="min-w-0 space-y-4 rounded-md bg-white p-4">
          <div>
            <h2 className="text-xl font-extrabold">Products received</h2>
            <p className="text-sm font-medium text-ink-soft">Tap Add on each product that came in, then enter how many.</p>
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

          <div className="-mx-4 overflow-x-auto overscroll-x-contain px-4 pb-2">
            <ul className="flex w-max gap-3">
              {visible.map((product) => {
                const active = order.includes(product.id);
                const adding = whole(quantities[product.id]);
                return (
                  <li
                    key={product.id}
                    className={`flex w-52 shrink-0 flex-col overflow-hidden rounded-md border-2 ${active ? "border-ink" : "border-line"} bg-white`}
                  >
                    <p className="flex items-center justify-between gap-2 bg-canvas px-3 py-2 text-sm font-bold">
                      <span className="tabular-nums" aria-label={`In stock for ${product.name}`}>
                        In stock: {formatQuantity(onHand(product.id))}
                      </span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-extrabold">{product.category}</span>
                    </p>
                    <div className="flex flex-1 items-start gap-3 px-3 py-3">
                      {product.picture}
                      <div className="min-w-0">
                        <p className="line-clamp-3 font-extrabold leading-snug">{product.name}</p>
                        <p className="mt-1 text-sm font-medium text-ink-soft">
                          {adding > 0 ? `+${formatQuantity(adding)} → ${formatQuantity(onHand(product.id) + adding)}` : `By the ${product.unit}`}
                        </p>
                      </div>
                    </div>
                    <div className="border-t border-line p-3">
                      {active ? (
                        <div className="flex items-center gap-1 rounded-full bg-canvas p-1">
                          <button
                            type="button"
                            onClick={() => step(product.id, -1)}
                            aria-label={`Fewer ${product.name}`}
                            className="grid size-10 place-items-center rounded-full bg-ink text-white"
                          >
                            <Minus aria-hidden className="size-4" />
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            enterKeyHint="done"
                            aria-label={`${product.name} received`}
                            autoComplete="off"
                            placeholder="0"
                            value={quantities[product.id] ?? ""}
                            onChange={(event) => setQuantity(product.id, event.currentTarget.value)}
                            onKeyDown={noEnter}
                            className="h-10 min-w-0 flex-1 bg-transparent text-center text-lg font-extrabold tabular-nums outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => step(product.id, 1)}
                            aria-label={`More ${product.name}`}
                            className="grid size-10 place-items-center rounded-full bg-ink text-white"
                          >
                            <Plus aria-hidden className="size-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setQuantity(product.id, quantities[product.id] ?? "")}
                          aria-label={`Add ${product.name}`}
                          className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-full bg-ink px-4 text-sm font-bold text-white"
                        >
                          Add <Plus aria-hidden className="size-4" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          {missing ? (
            <p role="alert" className="rounded-md border-2 border-danger bg-danger-soft px-3 py-2 text-sm font-bold text-danger">
              Add at least one product. Tap Add, then enter how many came in.
            </p>
          ) : null}
        </section>

        <aside className="h-fit space-y-4 rounded-md bg-white p-5 xl:sticky xl:top-6">
          <div>
            <h2 className="text-xl font-extrabold">On this delivery</h2>
            <p className="text-sm font-medium text-ink-soft">Check every line against the waybill before saving.</p>
          </div>
          {lines.length === 0 ? (
            <p className="rounded-md bg-canvas px-4 py-3 text-sm font-medium text-ink-soft">No products added yet. Tap Add on a product.</p>
          ) : (
            <ul className="space-y-1 rounded-md bg-canvas px-4 py-3 text-sm">
              {lines.map((line) => (
                <li key={line.product.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 text-ink-soft">{line.product.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-extrabold tabular-nums">{formatQuantity(line.quantity)}</span>
                    <button
                      type="button"
                      onClick={() => remove(line.product.id)}
                      aria-label={`Remove ${line.product.name}`}
                      className="grid size-8 place-items-center rounded-full text-ink-soft hover:bg-white hover:text-danger"
                    >
                      <X aria-hidden className="size-4" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <dl className="rounded-md bg-ink px-4 py-3 text-white">
            <dt className="text-xs font-bold uppercase tracking-wide text-nav">Total received</dt>
            <dd className="text-3xl font-extrabold tabular-nums">{formatQuantity(total)}</dd>
          </dl>
          <TextField label="Note (optional)" name="note" maxLength={500} />
          <FormMessage state={state} />
          <SubmitButton pending={pending} pendingLabel="Saving…">
            Save and add to stock
          </SubmitButton>
        </aside>
      </div>
    </form>
  );
}
