import type { SellingMode } from "@/types/database";

/**
 * The words a business sees for what it records. A depot takes orders that
 * go out on trips; a phone shop makes sales, mostly at the counter. The
 * records are the same underneath.
 */
export function saleWords(mode: SellingMode) {
  return mode === "serial"
    ? { one: "sale", many: "sales", One: "Sale", Many: "Sales" }
    : { one: "order", many: "orders", One: "Order", Many: "Orders" };
}

export const SELLING_MODES: { value: SellingMode; title: string; detail: string }[] = [
  {
    value: "quantity",
    title: "I count my goods",
    detail: "Crates, bags, cartons, packs. You record how many come in and how many go out."
  },
  {
    value: "serial",
    title: "I sell items with serial numbers",
    detail: "Phones, laptops, generators. Each one is recorded by its serial or IMEI. Chargers and accessories can still be counted."
  }
];
