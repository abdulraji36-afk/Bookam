import { beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  adjust,
  call,
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

// Bilikis rules for drinks empties: one shortage line per order on a trip,
// follow-ups pay off that line only, and extra empties are never credit.
describe("drinks shortage lines", () => {
  let db: Db;
  let owner: string;
  let staff: string;
  let depot: { id: string };
  let rgb: string;
  let pet: string;
  let empties: string;

  const totals = () => returnableTotals(db, depot.id, "Empties");

  // One order out on its own trip, returns recorded; gives back the order and its line.
  async function cycle(customer: string, crates: number, returned: number) {
    const order = await createOrder(db, staff, depot.id, customer, [{ product_id: rgb, quantity: crates }]);
    const trip = await createTrip(db, staff, depot.id, [order.id]);
    await call(db, staff, `select public.dispatch_trip($1)`, [trip.id]);
    await call(db, staff, `select public.record_trip_returns($1, public_today(), $2::jsonb)`, [
      trip.id,
      JSON.stringify([{ order_id: order.id, returnable_item_id: empties, quantity: returned }])
    ]);
    const line = (
      await db.query<{ id: string }>(`select id from public.trip_return_lines where order_id = $1`, [order.id])
    ).rows[0].id;
    return { order, trip, line };
  }
  const followUp = (line: string, quantity: number, user = staff, date = "public_today()") =>
    call(db, user, `select public.record_empties_followup($1, $2, ${date}, null)`, [line, quantity]);
  const shortage = async (line: string) =>
    (
      await db.query<{
        expected: string;
        initial_returned: string;
        followup_returned: string;
        outstanding: string;
        completed: boolean;
      }>(
        `select trim_scale(expected)::text as expected, trim_scale(initial_returned)::text as initial_returned,
                trim_scale(followup_returned)::text as followup_returned, trim_scale(outstanding)::text as outstanding,
                completed_at is not null as completed
         from public.empty_shortage_lines where id = $1`,
        [line]
      )
    ).rows[0];

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
    rgb = await saveProduct(db, owner, depot.id, {
      name: "Coke 50cl RGB",
      sellingPrice: 4200,
      costPrice: 3900,
      returnItem: "Empties"
    });
    pet = await saveProduct(db, owner, depot.id, { name: "Coke 50cl PET", unit: "pack", sellingPrice: 3000, costPrice: 2700 });
    await receiveStock(db, owner, depot.id, [
      { product_id: rgb, quantity: 1000 },
      { product_id: pet, quantity: 100 }
    ]);
    await adjust(db, owner, depot.id, { returnableId: empties, direction: "add", quantity: 100, reason: "opening_count" });
  });

  it("short 2, pays the 2 back, then a new order of 50 that all comes back leaves nothing owed", async () => {
    const mama = await saveCustomer(db, owner, depot.id, { name: "Mama Tunde" });
    const first = await cycle(mama, 50, 48);
    expect(await owedBy(db, mama)).toBe(2);
    expect(await shortage(first.line)).toEqual({
      expected: "50",
      initial_returned: "48",
      followup_returned: "0",
      outstanding: "2",
      completed: false
    });

    await followUp(first.line, 2);
    expect(await owedBy(db, mama)).toBe(0);
    // Completed, and still listed.
    expect(await shortage(first.line)).toMatchObject({ outstanding: "0", completed: true });
    await expect(followUp(first.line, 1)).rejects.toThrow(/This empty shortage is already settled/);

    const second = await cycle(mama, 50, 50);
    expect(await owedBy(db, mama)).toBe(0);
    // A full return is not a shortage.
    expect(await shortage(second.line)).toBeUndefined();
  });

  it("extra empties at trip close go into the store but are not credit", async () => {
    const kiosk = await saveCustomer(db, owner, depot.id, { name: "Alhaji Kiosk" });
    const before = (await totals()).holding;
    await cycle(kiosk, 20, 25);
    expect(await owedBy(db, kiosk)).toBe(0);
    expect((await totals()).holding).toBe(before + 25);

    // So the next order's shortage stands in full.
    const next = await cycle(kiosk, 20, 15);
    expect(await owedBy(db, kiosk)).toBe(5);
    expect(await shortage(next.line)).toMatchObject({ outstanding: "5" });
  });

  it("a follow-up pays off one order only, never more than it still owes", async () => {
    const grace = await saveCustomer(db, owner, depot.id, { name: "Grace Canteen" });
    const a = await cycle(grace, 10, 7); // owes 3
    const b = await cycle(grace, 10, 6); // owes 4
    expect(await owedBy(db, grace)).toBe(7);

    await expect(followUp(a.line, 4)).rejects.toThrow(/Only 3 empties are still owed on ORD-.+, so 4 cannot be recorded/);
    await expect(followUp(a.line, 0)).rejects.toThrow(/more than 0/);
    await expect(followUp(a.line, 1.5)).rejects.toThrow(/whole numbers/);
    await expect(followUp(a.line, 1, staff, "public_today() + 1")).rejects.toThrow(/cannot be in the future/);
    await expect(followUp(a.line, 1, staff, "public_today() - 1")).rejects.toThrow(/cannot be before the trip came back/);

    await followUp(a.line, 3);
    expect(await shortage(a.line)).toMatchObject({ outstanding: "0", completed: true });
    expect(await shortage(b.line)).toMatchObject({ outstanding: "4", completed: false });
    expect(await owedBy(db, grace)).toBe(4);

    // Another business cannot record against it.
    const outsider = await createUser(db, "outsider@example.com");
    await expect(followUp(b.line, 1, outsider)).rejects.toThrow();
  });

  it("an owner can void a follow-up recorded by mistake", async () => {
    const tola = await saveCustomer(db, owner, depot.id, { name: "Tola Stores" });
    const { line } = await cycle(tola, 10, 4);
    const followupId = ((await followUp(line, 6)) as { record_empties_followup: string }[])[0].record_empties_followup;
    expect(await owedBy(db, tola)).toBe(0);

    await expect(
      call(db, staff, `select public.void_empties_followup($1, 'Entered on the wrong order')`, [followupId])
    ).rejects.toThrow();
    await call(db, owner, `select public.void_empties_followup($1, 'Entered on the wrong order')`, [followupId]);
    expect(await owedBy(db, tola)).toBe(6);
    expect(await shortage(line)).toMatchObject({ outstanding: "6", completed: false });
  });

  it("correcting the trip figure keeps room for follow-ups already recorded", async () => {
    const bisi = await saveCustomer(db, owner, depot.id, { name: "Bisi Mart" });
    const { line } = await cycle(bisi, 10, 5);
    await followUp(line, 3);
    expect(await owedBy(db, bisi)).toBe(2);

    await expect(
      call(db, owner, `select public.correct_trip_return($1, 8, 'Recount found more crates')`, [line])
    ).rejects.toThrow(/3 empties were already brought back later for this order, so the trip figure can be at most 7/);
    await call(db, owner, `select public.correct_trip_return($1, 7, 'Recount found more crates')`, [line]);
    expect(await owedBy(db, bisi)).toBe(0);
    expect(await shortage(line)).toMatchObject({ initial_returned: "7", outstanding: "0", completed: true });

    // Without follow-ups, a figure above expected adds to the store but is still no credit.
    const other = await cycle(bisi, 10, 10);
    const before = (await totals()).holding;
    const otherLine = other.line;
    await call(db, owner, `select public.correct_trip_return($1, 12, 'Two extra crates came back')`, [otherLine]);
    expect(await owedBy(db, bisi)).toBe(0);
    expect((await totals()).holding).toBe(before + 2);
  });

  it("voiding an order undoes its trip return and its follow-ups", async () => {
    const ade = await saveCustomer(db, owner, depot.id, { name: "Ade Drinks" });
    const before = await totals();
    const { order, line } = await cycle(ade, 10, 25); // 15 extra
    await expect(followUp(line, 1)).rejects.toThrow(); // not a shortage line at all
    expect((await totals()).holding).toBe(before.holding + 25);
    await call(db, owner, `select public.void_order($1, 'Recorded for the wrong customer')`, [order.id]);
    expect(await owedBy(db, ade)).toBe(0);
    expect(await totals()).toEqual(before);

    const short = await cycle(ade, 10, 4);
    await followUp(short.line, 5);
    await call(db, owner, `select public.void_order($1, 'Recorded for the wrong customer')`, [short.order.id]);
    expect(await owedBy(db, ade)).toBe(0);
    expect(await totals()).toEqual(before);
    expect(await shortage(short.line)).toBeUndefined();
  });

  it("a drinks customer only owes empties through an order", async () => {
    const yemi = await saveCustomer(db, owner, depot.id, { name: "Yemi Stores" });
    await expect(
      call(db, owner, `select public.record_customer_opening_debt($1, $2, $3, 4, null)`, [depot.id, yemi, empties])
    ).rejects.toThrow(/empties are owed per order/);
    await expect(
      adjust(db, owner, depot.id, { returnableId: empties, direction: "add", quantity: 2, reason: "customer_return", customerId: yemi })
    ).rejects.toThrow(/empties are owed per order/);
    // Store counts still change as normal.
    await adjust(db, owner, depot.id, { returnableId: empties, direction: "add", quantity: 2, reason: "purchase" });
  });

  it("saves several customers' orders together, checking stock for the whole list", async () => {
    const one = await saveCustomer(db, owner, depot.id, { name: "Batch One" });
    const two = await saveCustomer(db, owner, depot.id, { name: "Batch Two" });
    const location = await mainLocation(db, depot.id);
    const batch = (orders: unknown) =>
      call(db, staff, `select * from public.create_order_batch($1, $2, public_today(), 'cash', null, $3::jsonb)`, [
        depot.id,
        location,
        JSON.stringify(orders)
      ]);

    await expect(batch([])).rejects.toThrow(/Add at least one customer/);
    await expect(batch([{ customer_id: one, items: [] }])).rejects.toThrow(/at least one product/);
    await expect(
      batch([
        { customer_id: one, items: [{ product_id: pet, quantity: 1 }] },
        { customer_id: one, items: [{ product_id: pet, quantity: 1 }] }
      ])
    ).rejects.toThrow(/Batch One is in this list twice/);
    // 60 + 60 packs: each fits on its own, not together.
    await expect(
      batch([
        { customer_id: one, items: [{ product_id: pet, quantity: 60 }] },
        { customer_id: two, items: [{ product_id: pet, quantity: 60 }] }
      ])
    ).rejects.toThrow(/Not enough Coke 50cl PET in stock for everyone on this list/);

    const saved = (await batch([
      { customer_id: one, items: [{ product_id: rgb, quantity: 5 }, { product_id: pet, quantity: 10 }] },
      { customer_id: two, items: [{ product_id: pet, quantity: 20 }] }
    ])) as { id: string; order_no: string }[];
    expect(saved).toHaveLength(2);
    const orders = await db.query<{ customer_id: string; status: string }>(
      `select customer_id, status from public.orders where id = any($1::uuid[]) order by order_no`,
      [saved.map((row) => row.id)]
    );
    expect(orders.rows).toEqual([
      { customer_id: one, status: "pending" },
      { customer_id: two, status: "pending" }
    ]);
  });
});
