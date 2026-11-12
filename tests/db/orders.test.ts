import { beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  call,
  createBusiness,
  createOrder,
  createTestDb,
  createTrip,
  createUser,
  mainLocation,
  receiveStock,
  saveCustomer,
  saveProduct,
  setPlan,
  updateOrder,
  type Db
} from "./harness";

describe("orders and dispatch", () => {
  let db: Db;
  let owner: string;
  let staff: string;
  let rival: string;
  let org: { id: string; slug: string };
  let rivalOrg: { id: string; slug: string };
  let cola: string; // return due
  let water: string; // no return
  let mama: string;
  let grace: string;

  const stockOf = async (productId: string) =>
    Number(
      (
        await db.query<{ n: string }>(
          `select coalesce(sum(qty_in - qty_out), 0)::text as n from public.stock_movements where product_id = $1`,
          [productId]
        )
      ).rows[0].n
    );
  const statusOf = async (table: "orders" | "dispatch_trips", id: string) =>
    (await db.query<{ status: string }>(`select status::text from public.${table} where id = $1`, [id])).rows[0]
      .status;

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
    grace = await saveCustomer(db, owner, org.id, { name: "Grace Canteen" });
    await receiveStock(db, owner, org.id, [
      { product_id: cola, quantity: 100 },
      { product_id: water, quantity: 50 }
    ]);
  });

  it("takes stock off when an order is saved and records the price at that moment", async () => {
    const order = await createOrder(db, staff, org.id, mama, [
      { product_id: cola, quantity: 40 },
      { product_id: water, quantity: 10 }
    ]);
    expect(order.order_no).toMatch(/^ORD-\d{8}-0001$/);
    expect(await stockOf(cola)).toBe(60);
    expect(await stockOf(water)).toBe(40);

    // A later price change must not rewrite the order.
    await saveProduct(db, owner, org.id, { id: cola, name: "Cola 50cl", sellingPrice: 5000, returnItem: "Empty crate" });
    const summary = await call(db, staff, `select total_quantity::float, total_amount::float, has_returns, status::text from public.order_summaries where id = $1`, [order.id]);
    expect(summary).toEqual([{ total_quantity: 50, total_amount: 40 * 4200 + 10 * 1800, has_returns: true, status: "pending" }]);
  });

  it("refuses an order for more than is in stock, and saves nothing", async () => {
    const before = (await db.query<{ n: number }>(`select count(*)::int as n from public.orders`)).rows[0].n;
    await expect(
      createOrder(db, staff, org.id, grace, [
        { product_id: water, quantity: 5 },
        { product_id: cola, quantity: 61 }
      ])
    ).rejects.toThrow(/Not enough stock for Cola 50cl\. Available: 60, requested: 61\./);
    expect((await db.query<{ n: number }>(`select count(*)::int as n from public.orders`)).rows[0].n).toBe(before);
    expect(await stockOf(water)).toBe(40);
  });

  it("refuses bad orders: no price, unknown customer, other business's product, future date", async () => {
    const unpriced = await saveProduct(db, owner, org.id, { name: "Lemon 35cl" });
    await receiveStock(db, owner, org.id, [{ product_id: unpriced, quantity: 5 }]);
    const rivalProduct = await saveProduct(db, rival, rivalOrg.id, { name: "Gas 12kg", sellingPrice: 9000 });
    const rivalCustomer = await saveCustomer(db, rival, rivalOrg.id, { name: "Their Customer" });

    await expect(createOrder(db, staff, org.id, mama, [{ product_id: unpriced, quantity: 1 }])).rejects.toThrow(
      /set a selling price for Lemon 35cl/
    );
    await expect(createOrder(db, staff, org.id, rivalCustomer, [{ product_id: water, quantity: 1 }])).rejects.toThrow(
      /one of your active customers/
    );
    await expect(createOrder(db, staff, org.id, mama, [{ product_id: rivalProduct, quantity: 1 }])).rejects.toThrow(
      /not an active product/
    );
    await expect(
      createOrder(db, staff, org.id, mama, [{ product_id: water, quantity: 1 }], { date: "2999-01-01" })
    ).rejects.toThrow(/future/);
    await expect(createOrder(db, staff, org.id, mama, [])).rejects.toThrow(/at least one product/);
    await expect(createOrder(db, rival, org.id, mama, [{ product_id: water, quantity: 1 }])).rejects.toThrow(
      /do not have permission/
    );
  });

  it("adjusts stock when a waiting order is edited, counting what it already held", async () => {
    const order = await createOrder(db, staff, org.id, grace, [{ product_id: water, quantity: 30 }]);
    expect(await stockOf(water)).toBe(10);

    // 30 held + 10 free = 40 available to this order.
    await updateOrder(db, staff, order.id, grace, [{ product_id: water, quantity: 40 }]);
    expect(await stockOf(water)).toBe(0);
    await expect(updateOrder(db, staff, order.id, grace, [{ product_id: water, quantity: 41 }])).rejects.toThrow(
      /Available: 40, requested: 41/
    );
    await updateOrder(db, staff, order.id, grace, [{ product_id: water, quantity: 15 }]);
    expect(await stockOf(water)).toBe(25);
  });

  it("puts stock back when an order is cancelled and keeps the record", async () => {
    const order = await createOrder(db, staff, org.id, grace, [{ product_id: water, quantity: 5 }], { payment: "credit" });
    expect(await stockOf(water)).toBe(20);
    await call(db, staff, `select public.cancel_order($1)`, [order.id]);
    expect(await stockOf(water)).toBe(25);
    expect(await statusOf("orders", order.id)).toBe("cancelled");
    await expect(call(db, staff, `select public.cancel_order($1)`, [order.id])).rejects.toThrow(/waiting for dispatch/);
  });

  it("builds a trip from waiting orders and locks them", async () => {
    const waiting = await db.query<{ id: string }>(
      `select id from public.orders where organization_id = $1 and status = 'pending' order by created_at`,
      [org.id]
    );
    const [withReturn, noReturn] = waiting.rows.map((row) => row.id);
    const trip = await createTrip(db, staff, org.id, [withReturn, noReturn]);

    expect(trip.trip_no).toMatch(/^TRP-\d{8}-0001$/);
    expect(await statusOf("orders", withReturn)).toBe("assigned");

    await expect(updateOrder(db, staff, noReturn, grace, [{ product_id: water, quantity: 1 }])).rejects.toThrow(
      /waiting for dispatch can be changed/
    );
    await expect(call(db, staff, `select public.cancel_order($1)`, [noReturn])).rejects.toThrow(/waiting for dispatch/);
    await expect(createTrip(db, staff, org.id, [withReturn])).rejects.toThrow(/no longer waiting/);
  });

  it("only lets an owner or admin cancel a trip, and returns its orders to waiting", async () => {
    const trip = (await db.query<{ id: string }>(`select id from public.dispatch_trips where organization_id = $1`, [org.id])).rows[0].id;
    const orders = (await db.query<{ order_id: string }>(`select order_id from public.dispatch_trip_orders where trip_id = $1`, [trip])).rows;

    await expect(call(db, staff, `select public.cancel_dispatch_trip($1)`, [trip])).rejects.toThrow(/do not have permission/);
    await call(db, owner, `select public.cancel_dispatch_trip($1)`, [trip]);

    expect(await statusOf("dispatch_trips", trip)).toBe("cancelled");
    for (const { order_id } of orders) expect(await statusOf("orders", order_id)).toBe("pending");
    await expect(call(db, staff, `select public.dispatch_trip($1)`, [trip])).rejects.toThrow(/already been dispatched or cancelled/);
  });

  it("completes no-return orders at dispatch and leaves return orders awaiting returns", async () => {
    const waiting = await db.query<{ id: string; has_returns: boolean }>(
      `select id, has_returns from public.order_summaries where organization_id = $1 and status = 'pending'`,
      [org.id]
    );
    const withReturn = waiting.rows.find((row) => row.has_returns)!.id;
    const noReturn = waiting.rows.find((row) => !row.has_returns)!.id;

    const mixed = await createTrip(db, staff, org.id, [withReturn, noReturn]);
    await call(db, staff, `select public.dispatch_trip($1)`, [mixed.id]);
    expect(await statusOf("orders", noReturn)).toBe("completed");
    expect(await statusOf("orders", withReturn)).toBe("dispatched");
    expect(await statusOf("dispatch_trips", mixed.id)).toBe("dispatched");

    const simple = await createOrder(db, staff, org.id, grace, [{ product_id: water, quantity: 2 }]);
    const simpleTrip = await createTrip(db, staff, org.id, [simple.id], { driver: "Tunde" });
    await call(db, staff, `select public.dispatch_trip($1)`, [simpleTrip.id]);
    expect(await statusOf("dispatch_trips", simpleTrip.id)).toBe("completed");
    expect(await statusOf("orders", simple.id)).toBe("completed");

    // Dispatching does not move stock a second time.
    expect(await stockOf(water)).toBe(23);
    await expect(call(db, owner, `select public.cancel_dispatch_trip($1)`, [mixed.id])).rejects.toThrow(/not been dispatched/);
  });

  it("keeps trips to one location and one business", async () => {
    await setPlan(db, org.id, "business");
    const annex = (await call(db, owner, `select public.create_location($1, 'Annex') as id`, [org.id]))[0].id as string;
    const order = await createOrder(db, staff, org.id, grace, [{ product_id: water, quantity: 1 }]);

    await expect(createTrip(db, staff, org.id, [order.id], { locationId: annex })).rejects.toThrow(/no longer waiting/);
    await expect(createTrip(db, rival, rivalOrg.id, [order.id])).rejects.toThrow(/no longer waiting/);
    await expect(createTrip(db, rival, org.id, [order.id])).rejects.toThrow(/do not have permission/);
    await expect(createTrip(db, staff, org.id, [])).rejects.toThrow(/at least one order/);
    await expect(
      createOrder(db, staff, org.id, grace, [{ product_id: water, quantity: 1 }], { locationId: annex })
    ).rejects.toThrow(/Not enough stock for Water 75cl\. Available: 0/);
    await expect(
      createOrder(db, staff, org.id, grace, [{ product_id: water, quantity: 1 }], {
        locationId: await mainLocation(db, rivalOrg.id)
      })
    ).rejects.toThrow(/one of your locations/);
  });
});
