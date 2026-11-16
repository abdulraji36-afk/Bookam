import { beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  adjust,
  call,
  createOrder,
  createTestDb,
  createTrip,
  createUser,
  owedBy,
  receiveStock,
  returnableId,
  saveCustomer,
  saveProduct,
  type Db
} from "./harness";

// Bilikis's admin sale correction: a sale that has gone out is corrected in
// place; stock, empties owed and empties expected back all follow.
describe("correcting a sale in place", () => {
  let db: Db;
  let owner: string;
  let staff: string;
  let depot: { id: string };
  let rgb: string;
  let rgb2: string;
  let pet: string;
  let empties: string;

  const stockOf = async (product: string) =>
    Number(
      (
        await db.query<{ n: string }>(
          `select coalesce(sum(qty_in - qty_out), 0)::text as n from public.stock_movements where product_id = $1`,
          [product]
        )
      ).rows[0].n
    );
  const correct = (user: string, order: string, items: { product_id: string; quantity: number }[], reason = "Driver loaded a different count") =>
    call(db, user, `select public.correct_order($1, $2::jsonb, $3)`, [order, JSON.stringify(items), reason]);
  const outOnTrip = async (customer: string, items: { product_id: string; quantity: number }[]) => {
    const order = await createOrder(db, staff, depot.id, customer, items);
    const trip = await createTrip(db, staff, depot.id, [order.id]);
    await call(db, staff, `select public.dispatch_trip($1)`, [trip.id]);
    return { order, trip };
  };

  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db, "owner@example.com");
    staff = await createUser(db, "staff@example.com");
    depot = (
      (await call(db, owner, `select * from public.create_organization('Depot', null, false, false, 'quantity', true, true)`)) as {
        id: string;
      }[]
    )[0];
    await addMember(db, owner, depot.id, { id: staff, email: "staff@example.com" }, "staff");
    empties = await returnableId(db, depot.id, "Empties");
    rgb = await saveProduct(db, owner, depot.id, { name: "Coke RGB", sellingPrice: 4200, costPrice: 3900, returnItem: "Empties" });
    rgb2 = await saveProduct(db, owner, depot.id, { name: "Fanta RGB", sellingPrice: 4100, costPrice: 3800, returnItem: "Empties" });
    pet = await saveProduct(db, owner, depot.id, { name: "Coke PET", unit: "pack", sellingPrice: 3000, costPrice: 2700 });
    await receiveStock(db, owner, depot.id, [
      { product_id: rgb, quantity: 100 },
      { product_id: rgb2, quantity: 100 },
      { product_id: pet, quantity: 50 }
    ]);
    await adjust(db, owner, depot.id, { returnableId: empties, direction: "add", quantity: 100, reason: "opening_count" });
  });

  it("an RGB sale out on a trip: stock and empties owed follow the corrected quantities", async () => {
    const mama = await saveCustomer(db, owner, depot.id, { name: "Mama" });
    const { order } = await outOnTrip(mama, [{ product_id: rgb, quantity: 50 }]);
    expect(await owedBy(db, mama)).toBe(50);
    await expect(correct(staff, order.id, [{ product_id: rgb, quantity: 40 }])).rejects.toThrow(/permission|owner|admin/i);
    await expect(correct(owner, order.id, [{ product_id: rgb, quantity: 40 }], "short")).rejects.toThrow(/reason/i);

    await correct(owner, order.id, [
      { product_id: rgb, quantity: 40 },
      { product_id: rgb2, quantity: 5 }
    ]);
    expect(await stockOf(rgb)).toBe(60);
    expect(await stockOf(rgb2)).toBe(95);
    expect(await owedBy(db, mama)).toBe(45);
    const audit = await db.query<{ reason: string }>(
      `select new_values->>'reason' as reason from public.audit_logs where action = 'correct_order' and entity_id = $1`,
      [order.id]
    );
    expect(audit.rows[0].reason).toBe("Driver loaded a different count");
  });

  it("after returns: the expected empties change, but never below what came back", async () => {
    const kiosk = await saveCustomer(db, owner, depot.id, { name: "Kiosk" });
    const { order, trip } = await outOnTrip(kiosk, [{ product_id: rgb, quantity: 20 }]);
    await call(db, staff, `select public.record_trip_returns($1, public_today(), $2::jsonb)`, [
      trip.id,
      JSON.stringify([{ order_id: order.id, returnable_item_id: empties, quantity: 15 }])
    ]);
    expect(await owedBy(db, kiosk)).toBe(5);
    await expect(correct(owner, order.id, [{ product_id: rgb, quantity: 12 }])).rejects.toThrow(
      /15 empties already came back for this sale/
    );
    await correct(owner, order.id, [{ product_id: rgb, quantity: 18 }]);
    expect(await owedBy(db, kiosk)).toBe(3);
    const line = await db.query<{ expected: string; outstanding: string }>(
      `select trim_scale(expected)::text as expected, trim_scale(outstanding)::text as outstanding
       from public.empty_shortage_lines where order_id = $1`,
      [order.id]
    );
    expect(line.rows[0]).toEqual({ expected: "18", outstanding: "3" });
  });

  it("keeps the price it was sold at, refuses more than is in stock, and leaves waiting orders to Edit", async () => {
    const shop = await saveCustomer(db, owner, depot.id, { name: "Shop" });
    const { order } = await outOnTrip(shop, [{ product_id: pet, quantity: 10 }]);
    await db.query(`update public.products set selling_price = 3500 where id = $1`, [pet]);
    await correct(owner, order.id, [{ product_id: pet, quantity: 8 }]);
    const price = await db.query<{ price: string }>(
      `select trim_scale(unit_price)::text as price from public.order_items where order_id = $1`,
      [order.id]
    );
    expect(price.rows[0].price).toBe("3000");
    expect(await stockOf(pet)).toBe(42);
    await expect(correct(owner, order.id, [{ product_id: pet, quantity: 60 }])).rejects.toThrow(/Not enough stock for Coke PET/);
    // One kind per order: a PET sale cannot take RGB crates.
    await expect(correct(owner, order.id, [{ product_id: rgb, quantity: 1 }])).rejects.toThrow(/stays PET/);
    const waiting = await createOrder(db, staff, depot.id, shop, [{ product_id: pet, quantity: 1 }]);
    await expect(correct(owner, waiting.id, [{ product_id: pet, quantity: 2 }])).rejects.toThrow(/Change it with Edit/);
  });
});
