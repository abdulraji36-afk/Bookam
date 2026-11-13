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

describe("voids, corrections and the daily report", () => {
  let db: Db;
  let owner: string;
  let staff: string;
  let rival: string;
  let org: { id: string; slug: string };
  let cola: string;
  let water: string;
  let mama: string;
  let musa: string;
  let crate: string;
  let location: string;
  const REASON = "Entered for the wrong customer";

  const stockOf = async (productId: string) =>
    Number(
      (
        await db.query<{ n: string }>(
          `select coalesce(sum(qty_in - qty_out), 0)::text as n from public.stock_movements where product_id = $1`,
          [productId]
        )
      ).rows[0].n
    );
  const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T & Record<string, unknown>>(sql, params)).rows[0];
  const totals = () => returnableTotals(db, org.id, "Empty crate");
  const voidOrder = (user: string, orderId: string, reason = REASON) =>
    call(db, user, `select public.void_order($1, $2)`, [orderId, reason]);
  const dispatch = (tripId: string) => call(db, staff, `select public.dispatch_trip($1)`, [tripId]);
  const recordReturns = (tripId: string, lines: { order_id: string; quantity: number }[]) =>
    call(db, staff, `select public.record_trip_returns($1, public_today(), $2::jsonb)`, [
      tripId,
      JSON.stringify(lines.map((line) => ({ ...line, returnable_item_id: crate })))
    ]);

  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db, "owner@example.com");
    staff = await createUser(db, "staff@example.com");
    rival = await createUser(db, "rival@example.com");
    org = await createBusiness(db, owner, "Depot One");
    await createBusiness(db, rival, "Rival Depot");
    await addMember(db, owner, org.id, { id: staff, email: "staff@example.com" }, "staff");

    cola = await saveProduct(db, owner, org.id, { name: "Cola 50cl", sellingPrice: 4200, returnItem: "Empty crate" });
    water = await saveProduct(db, owner, org.id, { name: "Water 75cl", unit: "pack", sellingPrice: 1800 });
    mama = await saveCustomer(db, owner, org.id, { name: "Mama Tunde Stores" });
    musa = await saveCustomer(db, owner, org.id, { name: "Alhaji Musa Kiosk" });
    crate = await returnableId(db, org.id, "Empty crate");
    location = await mainLocation(db, org.id);
    await receiveStock(db, owner, org.id, [
      { product_id: cola, quantity: 500 },
      { product_id: water, quantity: 100 }
    ]);
    await adjust(db, owner, org.id, { returnableId: crate, direction: "add", quantity: 100, reason: "opening_count" });
  });

  it("only lets an owner or admin void, and always needs a reason", async () => {
    const order = await createOrder(db, staff, org.id, mama, [{ product_id: water, quantity: 5 }]);
    await expect(voidOrder(staff, order.id)).rejects.toThrow(/do not have permission/);
    await expect(voidOrder(rival, order.id)).rejects.toThrow(/do not have permission/);
    await expect(voidOrder(owner, order.id, "  no ")).rejects.toThrow(/Give a reason/);

    await voidOrder(owner, order.id);
    expect(await stockOf(water)).toBe(100);
    const row = await one<{ status: string; voided_from_status: string; void_reason: string; voided: boolean }>(
      `select status::text, voided_from_status, void_reason, voided_at is not null as voided from public.orders where id = $1`,
      [order.id]
    );
    expect(row).toEqual({ status: "cancelled", voided_from_status: "pending", void_reason: REASON, voided: true });
    await expect(voidOrder(owner, order.id)).rejects.toThrow(/already been voided/);
  });

  it("takes a voided order off a trip that has not left", async () => {
    const keep = await createOrder(db, staff, org.id, mama, [{ product_id: water, quantity: 2 }]);
    const drop = await createOrder(db, staff, org.id, musa, [{ product_id: water, quantity: 3 }]);
    const trip = await createTrip(db, staff, org.id, [keep.id, drop.id]);

    await voidOrder(owner, drop.id);
    const summary = await one<{ order_count: number; total_quantity: string }>(
      `select order_count, total_quantity::text from public.dispatch_trip_summaries where id = $1`,
      [trip.id]
    );
    expect(summary).toEqual({ order_count: 1, total_quantity: "2.00" });
    expect(await stockOf(water)).toBe(98);
    await dispatch(trip.id);
  });

  it("voids an order that is out: debt removed, and the trip finishes if nothing else is due", async () => {
    const out = await createOrder(db, staff, org.id, mama, [{ product_id: cola, quantity: 30 }]);
    const other = await createOrder(db, staff, org.id, musa, [{ product_id: cola, quantity: 10 }]);
    const trip = await createTrip(db, staff, org.id, [out.id, other.id]);
    await dispatch(trip.id);
    expect(await owedBy(db, mama)).toBe(30);

    await voidOrder(owner, out.id);
    expect(await owedBy(db, mama)).toBe(0);
    expect(await stockOf(cola)).toBe(490); // only Musa's 10 are out
    expect(await totals()).toEqual({ holding: 100, owed: 10 });

    // Returns are now asked for the remaining order only.
    await expect(
      recordReturns(trip.id, [
        { order_id: out.id, quantity: 30 },
        { order_id: other.id, quantity: 10 }
      ])
    ).rejects.toThrow(/every customer on this trip/);
    await voidOrder(owner, other.id);
    const status = await one<{ status: string }>(`select status::text from public.dispatch_trips where id = $1`, [trip.id]);
    expect(status.status).toBe("completed");
    expect(await totals()).toEqual({ holding: 100, owed: 0 });
  });

  it("voids a completed order: stock back, returned crates taken out, shortage wiped", async () => {
    const order = await createOrder(db, staff, org.id, mama, [{ product_id: cola, quantity: 20 }]);
    const trip = await createTrip(db, staff, org.id, [order.id]);
    await dispatch(trip.id);
    await recordReturns(trip.id, [{ order_id: order.id, quantity: 14 }]); // 6 short
    expect(await totals()).toEqual({ holding: 114, owed: 6 });
    expect(await stockOf(cola)).toBe(480);

    await voidOrder(owner, order.id);
    expect(await totals()).toEqual({ holding: 100, owed: 0 });
    expect(await owedBy(db, mama)).toBe(0);
    expect(await stockOf(cola)).toBe(500);

    const audit = await one<{ old_values: { status: string; returned: unknown[] }; reason: string }>(
      `select old_values, new_values ->> 'reason' as reason from public.audit_logs
       where action = 'void_order' and entity_id = $1`,
      [order.id]
    );
    expect(audit.old_values.status).toBe("completed");
    expect(audit.old_values.returned).toHaveLength(1);
    expect(audit.reason).toBe(REASON);
  });

  it("corrects a returned figure and moves the difference to the customer's balance", async () => {
    const order = await createOrder(db, staff, org.id, musa, [{ product_id: cola, quantity: 20 }]);
    const trip = await createTrip(db, staff, org.id, [order.id]);
    await dispatch(trip.id);
    await recordReturns(trip.id, [{ order_id: order.id, quantity: 20 }]);
    const line = (await one<{ id: string }>(`select id from public.trip_return_lines where order_id = $1`, [order.id])).id;

    await expect(call(db, staff, `select public.correct_trip_return($1, 15, $2)`, [line, REASON])).rejects.toThrow(
      /do not have permission/
    );
    await expect(call(db, owner, `select public.correct_trip_return($1, 20, $2)`, [line, REASON])).rejects.toThrow(
      /already recorded/
    );
    await expect(call(db, owner, `select public.correct_trip_return($1, 15, '')`, [line])).rejects.toThrow(/Give a reason/);

    await call(db, owner, `select public.correct_trip_return($1, 15, $2)`, [line, "Miscounted at the gate"]);
    expect(await owedBy(db, musa)).toBe(5);
    expect(await totals()).toEqual({ holding: 115, owed: 5 });

    await call(db, owner, `select public.correct_trip_return($1, 18, $2)`, [line, "Three more found in the truck"]);
    expect(await owedBy(db, musa)).toBe(2);
    expect(await totals()).toEqual({ holding: 118, owed: 2 });
  });

  it("voids a stock receipt unless its stock has already been sold", async () => {
    const lemon = await saveProduct(db, owner, org.id, { name: "Lemon 35cl", sellingPrice: 3000 });
    const receipt = await receiveStock(db, staff, org.id, [{ product_id: lemon, quantity: 10 }]);
    const order = await createOrder(db, staff, org.id, mama, [{ product_id: lemon, quantity: 4 }]);

    await expect(call(db, staff, `select public.void_stock_receipt($1, $2)`, [receipt.id, REASON])).rejects.toThrow(
      /do not have permission/
    );
    await expect(call(db, owner, `select public.void_stock_receipt($1, $2)`, [receipt.id, REASON])).rejects.toThrow(
      /only 6 of Lemon 35cl is left in stock, and it brought in 10/
    );

    await voidOrder(owner, order.id);
    await call(db, owner, `select public.void_stock_receipt($1, $2)`, [receipt.id, REASON]);
    expect(await stockOf(lemon)).toBe(0);
    await expect(call(db, owner, `select public.void_stock_receipt($1, $2)`, [receipt.id, REASON])).rejects.toThrow(
      /already been voided/
    );
  });

  it("voids a supplier exchange and an adjustment, restoring the counts", async () => {
    const before = await totals();
    const exchange = (
      await call(db, staff, `select * from public.record_supplier_exchange($1, $2, public_today(), $3, 40, null, null, null, null)`, [
        org.id,
        location,
        crate
      ])
    )[0].id as string;
    expect((await totals()).holding).toBe(before.holding - 40);
    await expect(call(db, staff, `select public.void_supplier_exchange($1, $2)`, [exchange, REASON])).rejects.toThrow(
      /do not have permission/
    );
    await call(db, owner, `select public.void_supplier_exchange($1, $2)`, [exchange, REASON]);
    expect(await totals()).toEqual(before);

    // A customer-return adjustment: voiding it puts the debt back too.
    await adjust(db, owner, org.id, { returnableId: crate, direction: "add", quantity: 2, reason: "customer_return", customerId: musa });
    expect(await owedBy(db, musa)).toBe(0);
    const adjustment = (
      await one<{ id: string }>(`select id from public.returnable_adjustments where customer_id = $1`, [musa])
    ).id;
    await call(db, owner, `select public.void_returnable_adjustment($1, $2)`, [adjustment, REASON]);
    expect(await owedBy(db, musa)).toBe(2);
    expect(await totals()).toEqual(before);
    await expect(call(db, owner, `select public.void_returnable_adjustment($1, $2)`, [adjustment, REASON])).rejects.toThrow(
      /already been voided/
    );
  });

  it("refuses to void an 'add' adjustment once those items have left the store", async () => {
    const holding = (await totals()).holding;
    await adjust(db, owner, org.id, { returnableId: crate, direction: "add", quantity: 30, reason: "purchase" });
    const adjustment = (
      await one<{ id: string }>(`select id from public.returnable_adjustments where reason = 'purchase'`)
    ).id;
    await call(db, staff, `select * from public.record_supplier_exchange($1, $2, public_today(), $3, $4, null, null, null, null)`, [
      org.id,
      location,
      crate,
      holding + 10
    ]);
    await expect(call(db, owner, `select public.void_returnable_adjustment($1, $2)`, [adjustment, REASON])).rejects.toThrow(
      /it added 30, but only 20 are in store now/
    );
  });

  it("produces daily figures that add up, and nothing for another business", async () => {
    type StockRow = { name: string; opening: number; received: number; sold: number; closing: number };
    const stock = (await call(
      db,
      staff,
      `select name, opening::float, received::float, sold::float, closing::float
       from public.daily_stock_report($1, public_today()) order by name`,
      [org.id]
    )) as StockRow[];
    for (const row of stock) {
      expect(row.opening + row.received - row.sold).toBe(row.closing);
    }
    const colaRow = stock.find((row) => row.name === "Cola 50cl")!;
    expect(colaRow.closing).toBe(await stockOf(cola));
    expect(colaRow.opening).toBe(0); // everything happened today

    type ReturnableRow = { opening: number; came_in: number; went_out: number; closing: number; owed_closing: number };
    const returnables = (await call(
      db,
      staff,
      `select name, opening::float, came_in::float, went_out::float, closing::float, owed_closing::float
       from public.daily_returnables_report($1, public_today())`,
      [org.id]
    )) as ReturnableRow[];
    const view = await totals();
    expect(returnables).toHaveLength(1);
    expect(returnables[0].opening + returnables[0].came_in - returnables[0].went_out).toBe(returnables[0].closing);
    expect(returnables[0].closing).toBe(view.holding);
    expect(returnables[0].owed_closing).toBe(view.owed);

    expect(await call(db, rival, `select * from public.daily_stock_report($1, public_today())`, [org.id])).toEqual([]);
    expect(await call(db, rival, `select * from public.daily_returnables_report($1, public_today())`, [org.id])).toEqual([]);
  });
});
