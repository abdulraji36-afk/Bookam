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
  let staff: string;
  let depot: { id: string };
  let rgb: string;
  let pet: string;
  let empties: string;

  const customer = async (name: string, buys: string | null = null, type: string | null = null) =>
    (
      (await call(db, owner, `select public.save_customer($1, null, $2, null, null, null, $3, $4) as id`, [
        depot.id,
        name,
        type,
        buys
      ])) as { id: string }[]
    )[0].id;

  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db, "owner@example.com");
    staff = await createUser(db, "staff@example.com");
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

  it("customers have a type and buy RGB, PET or both", async () => {
    const petOnly = await customer("Grace Canteen", "pet", "Retailer");
    const rgbOnly = await customer("Alhaji Musa", "rgb", "Wholesaler");
    await expect(createOrder(db, owner, depot.id, petOnly, [{ product_id: rgb, quantity: 1 }])).rejects.toThrow(
      /Grace Canteen buys PET only, so Coke RGB \(RGB\) cannot be sold to them/
    );
    await expect(createOrder(db, owner, depot.id, rgbOnly, [{ product_id: pet, quantity: 1 }])).rejects.toThrow(
      /Alhaji Musa buys RGB only, so Coke PET cannot be sold to them/
    );
    await expect(createOrder(db, owner, depot.id, petOnly, [{ product_id: pet, quantity: 1 }])).resolves.toBeTruthy();
    await expect(customer("Odd Shop", "both", "Supermarket")).rejects.toThrow(/Retailer, Wholesaler or Distributor/);

    // An edit that leaves "buys" out keeps it.
    await call(db, owner, `select public.save_customer($1, $2, 'Grace Canteen', '0803', null, null)`, [depot.id, petOnly]);
    const row = await db.query<{ buys: string; customer_type: string }>(
      `select buys, customer_type from public.customers where id = $1`,
      [petOnly]
    );
    expect(row.rows[0]).toEqual({ buys: "pet", customer_type: "Retailer" });
  });

  it("a customer has only one order with RGB crates waiting; edit that one instead", async () => {
    const mama = await customer("Mama Tunde");
    const first = await createOrder(db, staff === owner ? owner : owner, depot.id, mama, [{ product_id: rgb, quantity: 5 }]);
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

  it("a drinks trip needs its truck", async () => {
    const shop = await customer("Truck Test Shop");
    const order = await createOrder(db, owner, depot.id, shop, [{ product_id: pet, quantity: 1 }]);
    await expect(
      call(db, owner, `select * from public.create_dispatch_trip_with_crew($1, $2, public_today(), 'Musa', ' ', null, $3::uuid[])`, [
        depot.id,
        await mainLocation(db, depot.id),
        [order.id]
      ])
    ).rejects.toThrow(/Enter the truck for this trip/);
  });
});
