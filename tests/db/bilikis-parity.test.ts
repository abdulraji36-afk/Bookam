import { beforeAll, describe, expect, it } from "vitest";
import {
  call,
  createOrder,
  createTestDb,
  createUser,
  mainLocation,
  receiveStock,
  returnableId,
  saveProduct,
  type Db
} from "./harness";

describe("the Bilikis rules for drinks", () => {
  let db: Db;
  let owner: string;
  let depot: { id: string };
  let rgb: string;
  let pet: string;
  let empties: string;

  const customer = async (name: string) =>
    (
      (await call(db, owner, `select public.save_customer($1, null, $2, null, null, null) as id`, [depot.id, name])) as {
        id: string;
      }[]
    )[0].id;

  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db, "owner@example.com");
    depot = (
      (await call(db, owner, `select * from public.create_organization('Bilikis Drinks', 'Drinks depot', false, false, 'quantity', true, true)`)) as {
        id: string;
      }[]
    )[0];
    rgb = await saveProduct(db, owner, depot.id, { name: "Coke RGB", unit: "crate", sellingPrice: 4200, costPrice: 3900, returnItem: "Empties" });
    pet = await saveProduct(db, owner, depot.id, { name: "Coke PET", unit: "pack", sellingPrice: 3000, costPrice: 2700 });
    empties = await returnableId(db, depot.id, "Empties");
  });

  it("RGB crates are whole numbers; PET packs need not be", async () => {
    await expect(receiveStock(db, owner, depot.id, [{ product_id: rgb, quantity: 12.5 }])).rejects.toThrow(
      /RGB crates are counted in whole numbers. Check the quantity for Coke RGB/
    );
    await receiveStock(db, owner, depot.id, [{ product_id: rgb, quantity: 100 }]);
    await receiveStock(db, owner, depot.id, [{ product_id: pet, quantity: 10.5 }]);
  });

  it("empties are whole numbers", async () => {
    await expect(
      call(db, owner, `select public.record_returnable_adjustment($1, $2, public_today(), $3, 'add', 2.5, 'opening_count', null, null)`, [
        depot.id,
        await mainLocation(db, depot.id),
        empties
      ])
    ).rejects.toThrow(/Empties are counted in whole numbers/);
  });

  it("a customer has only one order with RGB crates waiting; edit that one instead", async () => {
    const mama = await customer("Mama Tunde");
    const first = await createOrder(db, owner, depot.id, mama, [{ product_id: rgb, quantity: 5 }]);
    await expect(createOrder(db, owner, depot.id, mama, [{ product_id: rgb, quantity: 2 }])).rejects.toThrow(
      new RegExp(`Mama Tunde already has order ${first.order_no} with RGB crates waiting for dispatch`)
    );
    // PET alone is fine, and editing the waiting order is fine.
    await expect(createOrder(db, owner, depot.id, mama, [{ product_id: pet, quantity: 1 }])).resolves.toBeTruthy();
    await call(db, owner, `select public.update_order($1, public_today(), $2, 'cash', null, $3::jsonb)`, [
      first.id,
      mama,
      JSON.stringify([{ product_id: rgb, quantity: 8 }])
    ]);
  });

  it("a void needs a reason of at least 10 characters", async () => {
    const receipt = await receiveStock(db, owner, depot.id, [{ product_id: pet, quantity: 1 }]);
    await expect(call(db, owner, `select public.void_stock_receipt($1, 'Mistake')`, [receipt.id])).rejects.toThrow(
      /Give a reason of at least 10 characters/
    );
    await call(db, owner, `select public.void_stock_receipt($1, 'Entered by mistake')`, [receipt.id]);
  });

  it("each delivery line keeps its cost; only owners and admins see or change it", async () => {
    const receipt = await receiveStock(db, owner, depot.id, [{ product_id: rgb, quantity: 10 }]);
    const item = (
      await db.query<{ id: string }>(`select id from public.stock_receipt_items where receipt_id = $1`, [receipt.id])
    ).rows[0].id;
    const cost = async () =>
      Number(
        (await db.query<{ unit_cost: string }>(`select unit_cost::text from public.stock_receipt_item_costs where receipt_item_id = $1`, [item]))
          .rows[0].unit_cost
      );
    expect(await cost()).toBe(3900);

    // A later price change does not rewrite an old delivery.
    await saveProduct(db, owner, depot.id, { id: rgb, name: "Coke RGB", unit: "crate", sellingPrice: 4500, costPrice: 4100, returnItem: "Empties" });
    expect(await cost()).toBe(3900);

    await call(db, owner, `select public.set_receipt_item_cost($1, 3950)`, [item]);
    expect(await cost()).toBe(3950);

    const member = await createUser(db, "member@example.com");
    const { token } = (
      await call(db, owner, `select * from public.invite_member($1, 'member@example.com', 'staff')`, [depot.id])
    )[0] as { token: string };
    await call(db, member, `select * from public.accept_invitation($1)`, [token]);
    await expect(call(db, member, `select public.set_receipt_item_cost($1, 1)`, [item])).rejects.toThrow(/permission/);
    const seen = await call(db, member, `select * from public.stock_receipt_item_costs`);
    expect(seen).toHaveLength(0);
  });

});

describe("correcting a delivery, as in Bilikis", () => {
  let db: Db;
  let owner: string;
  let staff: string;
  let depot: { id: string };
  let rgb: string;
  let pet: string;
  let fanta: string;

  const onHand = async (productId: string) =>
    Number(
      (
        await db.query<{ on_hand: string }>(
          `select coalesce(sum(qty_in - qty_out), 0)::text as on_hand from public.stock_movements where product_id = $1`,
          [productId]
        )
      ).rows[0].on_hand
    );
  const lines = async (receiptId: string) =>
    (
      await db.query<{ product_id: string; quantity: string }>(
        `select product_id, quantity::text from public.stock_receipt_items where receipt_id = $1 order by quantity`,
        [receiptId]
      )
    ).rows.map((row) => [row.product_id, Number(row.quantity)]);
  const correct = (
    user: string,
    receiptId: string,
    items: { product_id: string; quantity: number; unit_cost?: number }[],
    options: { date?: string; reason?: string; reference?: string } = {}
  ) =>
    call(
      db,
      user,
      `select public.correct_stock_receipt($1, coalesce($2::date, public_today()), 'NBC', $3, null, $4::jsonb, $5)`,
      [receiptId, options.date ?? null, options.reference ?? "NBC-1", JSON.stringify(items), options.reason ?? "Breakages handed back to NBC"]
    );

  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db, "owner@example.com");
    staff = await createUser(db, "staff@example.com");
    depot = (
      (await call(db, owner, `select * from public.create_organization('Bilikis Drinks', 'Drinks depot', false, false, 'quantity', true, true)`)) as {
        id: string;
      }[]
    )[0];
    const { token } = (
      await call(db, owner, `select * from public.invite_member($1, 'staff@example.com', 'staff')`, [depot.id])
    )[0] as { token: string };
    await call(db, staff, `select * from public.accept_invitation($1)`, [token]);
    rgb = await saveProduct(db, owner, depot.id, { name: "Coke RGB", unit: "crate", sellingPrice: 4200, costPrice: 3900, returnItem: "Empties" });
    pet = await saveProduct(db, owner, depot.id, { name: "Coke PET", unit: "pack", sellingPrice: 3000, costPrice: 2700 });
    fanta = await saveProduct(db, owner, depot.id, { name: "Fanta PET", unit: "pack", sellingPrice: 3000, costPrice: 2700 });
  });

  it("changes numbers, adds and removes products, and stock follows", async () => {
    const receipt = await receiveStock(db, owner, depot.id, [
      { product_id: rgb, quantity: 500 },
      { product_id: pet, quantity: 40 }
    ]);
    // After offloading: 12 crates broken, PET was wrong (it was Fanta), cost corrected.
    await correct(owner, receipt.id, [
      { product_id: rgb, quantity: 488, unit_cost: 3950 },
      { product_id: fanta, quantity: 40 }
    ]);
    expect(await lines(receipt.id)).toEqual([
      [fanta, 40],
      [rgb, 488]
    ]);
    expect(await onHand(rgb)).toBe(488);
    expect(await onHand(pet)).toBe(0);
    expect(await onHand(fanta)).toBe(40);

    const cost = await db.query<{ unit_cost: string }>(
      `select c.unit_cost::text from public.stock_receipt_item_costs c
       join public.stock_receipt_items i on i.id = c.receipt_item_id
       where i.receipt_id = $1 and i.product_id = $2`,
      [receipt.id, rgb]
    );
    expect(cost.rows[0].unit_cost).toBe("3950.00");

    const history = await db.query<{ product_id: string; old_quantity: string; new_quantity: string }>(
      `select product_id, old_quantity::text, new_quantity::text from public.stock_receipt_corrections
       where receipt_id = $1 order by new_quantity`,
      [receipt.id]
    );
    expect(history.rows).toEqual([
      { product_id: pet, old_quantity: "40.00", new_quantity: "0.00" },
      { product_id: fanta, old_quantity: "0.00", new_quantity: "40.00" },
      { product_id: rgb, old_quantity: "500.00", new_quantity: "488.00" }
    ]);
  });

  it("a correction made the next day changes that delivery's day, and its daily report", async () => {
    const yesterday = (
      await db.query<{ day: string }>(`select (public_today() - 1)::text as day`)
    ).rows[0].day;
    const receipt = await receiveStock(db, owner, depot.id, [{ product_id: pet, quantity: 30 }], { date: yesterday });
    const report = async () =>
      (
        await call(db, owner, `select received::text, closing::text from public.daily_stock_report($1, $2::date) where product_id = $3`, [
          depot.id,
          yesterday,
          pet
        ])
      )[0] as { received: string; closing: string };
    expect(Number((await report()).received)).toBe(30);

    // Corrected today, for yesterday's delivery.
    await correct(owner, receipt.id, [{ product_id: pet, quantity: 25 }], { date: yesterday });
    expect(Number((await report()).received)).toBe(25);
    expect(await onHand(pet)).toBe(25);
  });

  it("can move a delivery to the right date", async () => {
    const receipt = await receiveStock(db, owner, depot.id, [{ product_id: fanta, quantity: 5 }]);
    const yesterday = (await db.query<{ day: string }>(`select (public_today() - 1)::text as day`)).rows[0].day;
    await correct(owner, receipt.id, [{ product_id: fanta, quantity: 5 }], { date: yesterday, reason: "Arrived yesterday evening" });
    const moved = await db.query<{ movement_date: string }>(
      `select movement_date::text from public.stock_movements where source_id = $1`,
      [receipt.id]
    );
    expect(moved.rows[0].movement_date).toBe(yesterday);
  });

  it("refuses what would not make sense", async () => {
    const receipt = await receiveStock(db, owner, depot.id, [{ product_id: pet, quantity: 10 }]);
    await expect(correct(staff, receipt.id, [{ product_id: pet, quantity: 9 }])).rejects.toThrow(/permission/);
    await expect(correct(owner, receipt.id, [{ product_id: pet, quantity: 9 }], { reason: "short" })).rejects.toThrow(
      /at least 10 characters/
    );
    await correct(owner, receipt.id, [{ product_id: pet, quantity: 9 }]);
    await expect(correct(owner, receipt.id, [{ product_id: pet, quantity: 9 }])).rejects.toThrow(/Nothing has changed/);
    await expect(correct(owner, receipt.id, [])).rejects.toThrow(/void it instead/);
    await expect(correct(owner, receipt.id, [{ product_id: pet, quantity: 0 }])).rejects.toThrow(/greater than zero/);
    await expect(
      correct(owner, receipt.id, [
        { product_id: pet, quantity: 5 },
        { product_id: pet, quantity: 5 }
      ])
    ).rejects.toThrow(/more than once/);
    await expect(correct(owner, receipt.id, [{ product_id: pet, quantity: 8 }], { reference: " " })).rejects.toThrow(
      /delivery reference/
    );
    await expect(correct(owner, receipt.id, [{ product_id: rgb, quantity: 4.5 }])).rejects.toThrow(/whole numbers/);
  });

  it("cannot take off stock that has already gone out", async () => {
    const before = await onHand(fanta);
    const receipt = await receiveStock(db, owner, depot.id, [{ product_id: fanta, quantity: 20 }]);
    const shop = (
      (await call(db, owner, `select public.save_customer($1, null, 'Grace Canteen', null, null, null) as id`, [depot.id])) as {
        id: string;
      }[]
    )[0].id;
    await createOrder(db, owner, depot.id, shop, [{ product_id: fanta, quantity: before + 20 }]);
    await expect(correct(owner, receipt.id, [{ product_id: fanta, quantity: 15 }])).rejects.toThrow(
      /would leave Fanta PET below zero in stock \(-5\)/
    );
  });

  it("a voided delivery cannot be corrected", async () => {
    const receipt = await receiveStock(db, owner, depot.id, [{ product_id: pet, quantity: 2 }]);
    await call(db, owner, `select public.void_stock_receipt($1, 'Entered by mistake')`, [receipt.id]);
    await expect(correct(owner, receipt.id, [{ product_id: pet, quantity: 1 }])).rejects.toThrow(/voided/);
  });
});
