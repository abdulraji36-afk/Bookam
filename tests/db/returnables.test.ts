import { beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  adjust,
  call,
  createBusiness,
  createOrder,
  createTestDb,
  createTrip,
  createUser,
  mainLocation,
  owedBy,
  receiveStock,
  returnableId,
  returnableTotals,
  saveCustomer,
  saveProduct,
  type Db
} from "./harness";

describe("returnables", () => {
  let db: Db;
  let owner: string;
  let staff: string;
  let rival: string;
  let org: { id: string; slug: string };
  let rivalOrg: { id: string; slug: string };
  let cola: string;
  let water: string;
  let mama: string;
  let musa: string;
  let grace: string;
  let crate: string;
  let location: string;

  const totals = () => returnableTotals(db, org.id, "Empty crate");

  /** Orders -> trip -> dispatch; returns the trip and its orders. */
  async function sendOut(lines: [customer: string, product: string, quantity: number][]) {
    const orders = [];
    for (const [customer, product, quantity] of lines) {
      orders.push(await createOrder(db, staff, org.id, customer, [{ product_id: product, quantity }]));
    }
    const trip = await createTrip(db, staff, org.id, orders.map((order) => order.id));
    await call(db, staff, `select public.dispatch_trip($1)`, [trip.id]);
    return { trip, orders };
  }

  const recordReturns = (user: string, tripId: string, returns: { order_id: string; quantity: number }[]) =>
    call(db, user, `select public.record_trip_returns($1, public_today(), $2::jsonb)`, [
      tripId,
      JSON.stringify(returns.map((line) => ({ ...line, returnable_item_id: crate })))
    ]);

  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db, "owner@example.com");
    staff = await createUser(db, "staff@example.com");
    rival = await createUser(db, "rival@example.com");
    org = await createBusiness(db, owner, "Depot One");
    rivalOrg = await createBusiness(db, rival, "Rival Depot");
    await addMember(db, owner, org.id, { id: staff, email: "staff@example.com" }, "staff");

    cola = await saveProduct(db, owner, org.id, { name: "Cola 50cl", sellingPrice: 4200, returnItem: "Empty crate" });
    water = await saveProduct(db, owner, org.id, { name: "Water 75cl", unit: "pack", sellingPrice: 1800 });
    mama = await saveCustomer(db, owner, org.id, { name: "Mama Tunde Stores" });
    musa = await saveCustomer(db, owner, org.id, { name: "Alhaji Musa Kiosk" });
    grace = await saveCustomer(db, owner, org.id, { name: "Grace Canteen" });
    crate = await returnableId(db, org.id, "Empty crate");
    location = await mainLocation(db, org.id);
    await receiveStock(db, owner, org.id, [
      { product_id: cola, quantity: 500 },
      { product_id: water, quantity: 100 }
    ]);
  });

  it("starts at zero and lets an owner set the opening count", async () => {
    expect(await totals()).toEqual({ holding: 0, owed: 0 });
    await adjust(db, owner, org.id, { returnableId: crate, direction: "add", quantity: 200, reason: "opening_count" });
    expect(await totals()).toEqual({ holding: 200, owed: 0 });
  });

  it("makes the customer owe the crates from the moment the trip is dispatched", async () => {
    const waiting = await createOrder(db, staff, org.id, mama, [{ product_id: cola, quantity: 40 }]);
    expect(await owedBy(db, mama)).toBe(0); // saving an order is not yet a debt

    const trip = await createTrip(db, staff, org.id, [waiting.id]);
    await call(db, staff, `select public.dispatch_trip($1)`, [trip.id]);
    expect(await owedBy(db, mama)).toBe(40);
    expect(await totals()).toEqual({ holding: 200, owed: 40 });

    // Bring them all back: the trip and order complete, nothing is owed.
    await recordReturns(staff, trip.id, [{ order_id: waiting.id, quantity: 40 }]);
    expect(await owedBy(db, mama)).toBe(0);
    expect(await totals()).toEqual({ holding: 240, owed: 0 });
    const status = await db.query<{ trip: string; order: string }>(
      `select t.status::text as trip, o.status::text as order
       from public.dispatch_trips t, public.orders o where t.id = $1 and o.id = $2`,
      [trip.id, waiting.id]
    );
    expect(status.rows[0]).toEqual({ trip: "completed", order: "completed" });
  });

  it("keeps a shortage on the customer's balance and records expected against returned", async () => {
    const { trip, orders } = await sendOut([
      [mama, cola, 30],
      [musa, cola, 20],
      [grace, water, 5] // nothing to bring back
    ]);

    await recordReturns(staff, trip.id, [
      { order_id: orders[0].id, quantity: 22 }, // 8 short
      { order_id: orders[1].id, quantity: 0 } // brought nothing
    ]);

    expect(await owedBy(db, mama)).toBe(8);
    expect(await owedBy(db, musa)).toBe(20);
    expect(await totals()).toEqual({ holding: 262, owed: 28 });

    const lines = await call(
      db,
      staff,
      `select expected_quantity::float as expected, returned_quantity::float as returned
       from public.trip_return_lines where trip_id = $1 order by expected_quantity desc`,
      [trip.id]
    );
    expect(lines).toEqual([
      { expected: 30, returned: 22 },
      { expected: 20, returned: 0 }
    ]);

    const balances = await call(
      db,
      staff,
      `select customer_name, owed::float from public.customer_returnable_balances order by owed desc`
    );
    expect(balances).toEqual([
      { customer_name: "Alhaji Musa Kiosk", owed: 20 },
      { customer_name: "Mama Tunde Stores", owed: 8 }
    ]);
  });

  it("refuses incomplete, duplicated or foreign return entries, and a second recording", async () => {
    const { trip, orders } = await sendOut([
      [mama, cola, 10],
      [musa, cola, 10]
    ]);
    const before = await totals();

    await expect(recordReturns(staff, trip.id, [{ order_id: orders[0].id, quantity: 10 }])).rejects.toThrow(
      /every customer on this trip/
    );
    await expect(
      recordReturns(staff, trip.id, [
        { order_id: orders[0].id, quantity: 5 },
        { order_id: orders[0].id, quantity: 5 }
      ])
    ).rejects.toThrow(/every customer on this trip/);
    await expect(
      recordReturns(staff, trip.id, [
        { order_id: orders[0].id, quantity: -1 },
        { order_id: orders[1].id, quantity: 1 }
      ])
    ).rejects.toThrow(/zero or more/);
    await expect(recordReturns(rival, trip.id, [])).rejects.toThrow(/do not have permission/);
    expect(await totals()).toEqual(before);

    // More than expected is allowed: the extra pays down older debt.
    await recordReturns(staff, trip.id, [
      { order_id: orders[0].id, quantity: 18 }, // 10 for this trip + the 8 still owed
      { order_id: orders[1].id, quantity: 10 }
    ]);
    expect(await owedBy(db, mama)).toBe(0);
    await expect(
      recordReturns(staff, trip.id, [
        { order_id: orders[0].id, quantity: 1 },
        { order_id: orders[1].id, quantity: 1 }
      ])
    ).rejects.toThrow(/out with returns due/);
  });

  it("supplier exchange takes crates out of the store without touching what customers owe", async () => {
    const before = await totals();
    const rows = await call(
      db,
      staff,
      `select * from public.record_supplier_exchange($1, $2, public_today(), $3, 150, 'Bottler', 'WB-77', 'Chidi', null)`,
      [org.id, location, crate]
    );
    expect(rows[0].exchange_no).toMatch(/^EXC-\d{8}-0001$/);
    expect(await totals()).toEqual({ holding: before.holding - 150, owed: before.owed });

    await expect(
      call(db, staff, `select * from public.record_supplier_exchange($1, $2, public_today(), $3, 9999, null, null, null, null)`, [
        org.id,
        location,
        crate
      ])
    ).rejects.toThrow(/You only have \d+ Empty crate in store here/);
  });

  it("adjustment add with a customer: they brought crates without buying", async () => {
    const before = await totals();
    expect(await owedBy(db, musa)).toBe(20);

    // Musa brings back 25: clears his 20 and leaves him 5 in credit.
    await adjust(db, owner, org.id, {
      returnableId: crate,
      direction: "add",
      quantity: 25,
      reason: "customer_return",
      customerId: musa
    });
    expect(await owedBy(db, musa)).toBe(-5);
    expect(await totals()).toEqual({ holding: before.holding + 25, owed: before.owed - 25 });

    // The page shows what is owed and what is held in credit separately.
    const split = await call(db, staff, `select owed::float, credit::float from public.returnable_totals`);
    expect(split).toEqual([{ owed: before.owed - 20, credit: 5 }]);

    // His next order of 12 leaves him owing 7, not 12.
    await sendOut([[musa, cola, 12]]);
    expect(await owedBy(db, musa)).toBe(7);
  });

  it("adjustment add and subtract without a customer only change the store count", async () => {
    const before = await totals();
    await adjust(db, owner, org.id, { returnableId: crate, direction: "add", quantity: 50, reason: "purchase" });
    await adjust(db, owner, org.id, { returnableId: crate, direction: "subtract", quantity: 6, reason: "damaged_or_lost" });
    await adjust(db, owner, org.id, {
      returnableId: crate,
      direction: "subtract",
      quantity: 4,
      reason: "correction",
      note: "Recount on Friday"
    });
    expect(await totals()).toEqual({ holding: before.holding + 40, owed: before.owed });
  });

  it("enforces the adjustment rules", async () => {
    const base = { returnableId: crate, quantity: 1 };
    await expect(adjust(db, staff, org.id, { ...base, direction: "add", reason: "purchase" })).rejects.toThrow(
      /do not have permission/
    );
    await expect(adjust(db, owner, org.id, { ...base, direction: "add", reason: "damaged_or_lost" })).rejects.toThrow(
      /does not go with adding/
    );
    await expect(adjust(db, owner, org.id, { ...base, direction: "subtract", reason: "purchase" })).rejects.toThrow(
      /does not go with subtracting/
    );
    await expect(adjust(db, owner, org.id, { ...base, direction: "add", reason: "customer_return" })).rejects.toThrow(
      /Choose the customer/
    );
    await expect(
      adjust(db, owner, org.id, { ...base, direction: "add", reason: "purchase", customerId: mama })
    ).rejects.toThrow(/can only be named/);
    await expect(adjust(db, owner, org.id, { ...base, direction: "add", reason: "correction" })).rejects.toThrow(
      /Add a note/
    );
    await expect(
      adjust(db, owner, org.id, { ...base, quantity: 99999, direction: "subtract", reason: "damaged_or_lost" })
    ).rejects.toThrow(/cannot be subtracted/);
    await expect(adjust(db, owner, org.id, { ...base, quantity: 0, direction: "add", reason: "purchase" })).rejects.toThrow(
      /greater than zero/
    );

    // Another business's customer, returnable or location is never accepted.
    const theirCustomer = await saveCustomer(db, rival, rivalOrg.id, { name: "Their Customer" });
    await saveProduct(db, rival, rivalOrg.id, { name: "Gas 12kg", returnItem: "Cylinder" });
    const theirReturnable = await returnableId(db, rivalOrg.id, "Cylinder");
    await expect(
      adjust(db, owner, org.id, { ...base, direction: "add", reason: "customer_return", customerId: theirCustomer })
    ).rejects.toThrow(/one of your customers/);
    await expect(
      adjust(db, owner, org.id, { returnableId: theirReturnable, quantity: 1, direction: "add", reason: "purchase" })
    ).rejects.toThrow(/one of your returnable items/);
    await expect(
      adjust(db, owner, org.id, { ...base, direction: "add", reason: "purchase", locationId: await mainLocation(db, rivalOrg.id) })
    ).rejects.toThrow(/one of your locations/);
    await expect(adjust(db, rival, org.id, { ...base, direction: "add", reason: "purchase" })).rejects.toThrow(
      /do not have permission/
    );
  });

  it("records a debt a customer already had before the business started here", async () => {
    expect(await owedBy(db, grace)).toBe(0);
    const before = await totals();
    await call(db, owner, `select public.record_customer_opening_debt($1, $2, $3, 15, 'From the old book')`, [
      org.id,
      grace,
      crate
    ]);
    expect(await owedBy(db, grace)).toBe(15);
    expect(await totals()).toEqual({ holding: before.holding, owed: before.owed + 15 });
    await expect(
      call(db, staff, `select public.record_customer_opening_debt($1, $2, $3, 1, null)`, [org.id, grace, crate])
    ).rejects.toThrow(/do not have permission/);
  });

  it("always keeps the totals equal to the sum of every movement", async () => {
    const sums = await db.query<{ holding: string; owed: string; per_customer: string }>(
      `select
         sum(holding_delta)::text as holding,
         sum(owed_delta)::text as owed,
         (select sum(owed)::text from public.customer_returnable_balances where organization_id = $1) as per_customer
       from public.returnable_movements where organization_id = $1`,
      [org.id]
    );
    const view = await totals();
    expect(Number(sums.rows[0].holding)).toBe(view.holding);
    expect(Number(sums.rows[0].owed)).toBe(view.owed);
    expect(Number(sums.rows[0].per_customer)).toBe(view.owed);
  });
});
