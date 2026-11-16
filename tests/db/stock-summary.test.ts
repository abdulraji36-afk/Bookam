import { beforeAll, describe, expect, it } from "vitest";
import {
  adjust,
  call,
  createOrder,
  createTestDb,
  createTrip,
  createUser,
  mainLocation,
  receiveStock,
  returnableId,
  saveCustomer,
  saveProduct,
  type Db
} from "./harness";

// Stock summary: everything in the depot at the close of a chosen day.
describe("stock summary", () => {
  let db: Db;
  let owner: string;
  let depot: { id: string };
  let rgb: string;
  let pet: string;
  let empties: string;

  const summary = async (date: string) =>
    (
      (await call(db, owner, `select * from public.stock_summary($1, ${date})`, [depot.id])) as {
        name: string;
        returnable: boolean;
        in_stock: string;
      }[]
    ).map((row) => [row.name, row.returnable, Number(row.in_stock)]);
  const emptiesAt = async (date: string) => {
    const row = (
      (await call(db, owner, `select * from public.empties_summary($1, ${date})`, [depot.id])) as Record<string, string>[]
    )[0];
    return {
      tripReturns: Number(row.trip_returns),
      followups: Number(row.followups),
      taken: Number(row.taken_by_supplier),
      adjustments: Number(row.adjustments),
      inStore: Number(row.in_store)
    };
  };

  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db, "owner@example.com");
    depot = (
      (await call(db, owner, `select * from public.create_organization('Depot', null, false, false, 'quantity', true, true)`)) as {
        id: string;
      }[]
    )[0];
    empties = await returnableId(db, depot.id, "Empties");
    rgb = await saveProduct(db, owner, depot.id, { name: "Cola RGB", sellingPrice: 4200, costPrice: 3900, returnItem: "Empties" });
    pet = await saveProduct(db, owner, depot.id, { name: "Cola PET", unit: "pack", sellingPrice: 3000, costPrice: 2700 });
  });

  it("gives each product's stock at the close of the chosen day", async () => {
    const yesterday = (
      await db.query<{ day: string }>(`select (public_today() - 1)::text as day`)
    ).rows[0].day;
    await receiveStock(db, owner, depot.id, [{ product_id: rgb, quantity: 100 }], { date: yesterday });
    await receiveStock(db, owner, depot.id, [
      { product_id: rgb, quantity: 50 },
      { product_id: pet, quantity: 40 }
    ]);
    const mama = await saveCustomer(db, owner, depot.id, { name: "Mama" });
    await createOrder(db, owner, depot.id, mama, [{ product_id: rgb, quantity: 30 }]);

    expect(await summary("public_today() - 1")).toEqual([
      ["Cola PET", false, 0],
      ["Cola RGB", true, 100]
    ]);
    expect(await summary("public_today()")).toEqual([
      ["Cola PET", false, 40],
      ["Cola RGB", true, 120]
    ]);
  });

  it("gives the empties in store and where they came from", async () => {
    await adjust(db, owner, depot.id, { returnableId: empties, direction: "add", quantity: 200, reason: "opening_count" });
    const location = await mainLocation(db, depot.id);
    await call(
      db,
      owner,
      `select * from public.record_empty_exchange($1, $2, public_today(), $3, 50, 50, 'NBC', 'NBC-1', null, null)`,
      [depot.id, location, empties]
    );
    // Mama's 30 crates go out and 25 come back; she brings 3 more later.
    const order = (await db.query<{ id: string }>(`select id from public.orders limit 1`)).rows[0].id;
    const trip = await createTrip(db, owner, depot.id, [order]);
    await call(db, owner, `select public.dispatch_trip($1)`, [trip.id]);
    await call(db, owner, `select public.record_trip_returns($1, public_today(), $2::jsonb)`, [
      trip.id,
      JSON.stringify([{ order_id: order, returnable_item_id: empties, quantity: 25 }])
    ]);
    const line = (await db.query<{ id: string }>(`select id from public.trip_return_lines limit 1`)).rows[0].id;
    await call(db, owner, `select public.record_empties_followup($1, 3, public_today(), null)`, [line]);

    expect(await emptiesAt("public_today()")).toEqual({
      tripReturns: 25,
      followups: 3,
      taken: 50,
      adjustments: 200,
      inStore: 178
    });
    // Nothing had happened yet the day before.
    expect(await emptiesAt("public_today() - 1")).toEqual({
      tripReturns: 0,
      followups: 0,
      taken: 0,
      adjustments: 0,
      inStore: 0
    });
  });
});
