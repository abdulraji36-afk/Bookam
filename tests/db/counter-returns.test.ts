import { beforeAll, describe, expect, it } from "vitest";
import {
  adjust,
  call,
  createOrder,
  createTestDb,
  createUser,
  owedBy,
  receiveStock,
  returnableId,
  returnableTotals,
  saveCustomer,
  saveProduct,
  type Db
} from "./harness";

// A depot that sells at the counter: a returnable order handed over waits for
// what comes back, on a Counter trip, and the usual returns flow follows.
describe("counter returns", () => {
  let db: Db;
  let owner: string;
  let depot: { id: string };
  let cylinder: string;
  let regulator: string;
  let pool: string;

  const handOver = (order: string) => call(db, owner, `select public.hand_over_order($1)`, [order]);
  const orderState = async (order: string) =>
    (
      await db.query<{ status: string; trip_no: string | null; driver: string | null; trip_status: string | null }>(
        `select o.status, t.trip_no, t.driver_name as driver, t.status::text as trip_status
         from public.orders o
         left join public.dispatch_trip_orders dto on dto.order_id = o.id
         left join public.dispatch_trips t on t.id = dto.trip_id
         where o.id = $1`,
        [order]
      )
    ).rows[0];

  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db, "owner@example.com");
    depot = (
      (await call(db, owner, `select * from public.create_organization('Gas Depot', null, true, false, 'quantity', false, true)`)) as {
        id: string;
      }[]
    )[0];
    await call(db, owner, `select public.set_depot_trade($1, 'goods', 'Empty cylinders', true)`, [depot.id]);
    pool = await returnableId(db, depot.id, "Empty cylinders");
    cylinder = await saveProduct(db, owner, depot.id, {
      name: "Gas refill",
      unit: "cylinder",
      sellingPrice: 15000,
      costPrice: 13000,
      returnItem: "Empty cylinders"
    });
    regulator = await saveProduct(db, owner, depot.id, { name: "Regulator", unit: "piece", sellingPrice: 6000, costPrice: 4500 });
    await receiveStock(db, owner, depot.id, [
      { product_id: cylinder, quantity: 50 },
      { product_id: regulator, quantity: 10 }
    ]);
    await adjust(db, owner, depot.id, { returnableId: pool, direction: "add", quantity: 20, reason: "opening_count" });
  });

  it("a returnable order handed over waits for returns on a Counter trip; the customer owes them", async () => {
    const chika = await saveCustomer(db, owner, depot.id, { name: "Chika Kitchen" });
    const order = await createOrder(db, owner, depot.id, chika, [{ product_id: cylinder, quantity: 10 }]);
    await handOver(order.id);
    expect(await orderState(order.id)).toMatchObject({ status: "dispatched", driver: "Counter", trip_status: "dispatched" });
    expect(await owedBy(db, chika)).toBe(10);
  });

  it("what comes back is recorded like a trip return; a shortage stays on that order", async () => {
    const ada = await saveCustomer(db, owner, depot.id, { name: "Ada Foods" });
    const order = await createOrder(db, owner, depot.id, ada, [{ product_id: cylinder, quantity: 6 }]);
    await handOver(order.id);
    const trip = (
      await db.query<{ trip_id: string }>(`select trip_id from public.dispatch_trip_orders where order_id = $1`, [order.id])
    ).rows[0].trip_id;
    const before = (await returnableTotals(db, depot.id, "Empty cylinders")).holding;
    await call(db, owner, `select public.record_trip_returns($1, public_today(), $2::jsonb)`, [
      trip,
      JSON.stringify([{ order_id: order.id, returnable_item_id: pool, quantity: 4 }])
    ]);
    expect(await orderState(order.id)).toMatchObject({ status: "completed", trip_status: "completed" });
    expect(await owedBy(db, ada)).toBe(2);
    expect((await returnableTotals(db, depot.id, "Empty cylinders")).holding).toBe(before + 4);
    const line = await db.query<{ outstanding: string }>(
      `select trim_scale(outstanding)::text as outstanding from public.empty_shortage_lines where order_id = $1`,
      [order.id]
    );
    expect(line.rows[0].outstanding).toBe("2");
  });

  it("an order with nothing to bring back is completed at once, with no trip", async () => {
    const shop = await saveCustomer(db, owner, depot.id, { name: "Corner Shop" });
    const order = await createOrder(db, owner, depot.id, shop, [{ product_id: regulator, quantity: 1 }]);
    await handOver(order.id);
    expect(await orderState(order.id)).toEqual({ status: "completed", trip_no: null, driver: null, trip_status: null });
  });
});
