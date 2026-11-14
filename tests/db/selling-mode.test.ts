import { beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, createOrder, createTestDb, createTrip, createUser, saveCustomer, saveProduct, receiveStock, type Db } from "./harness";

type Settings = { selling_mode: string; does_delivery: boolean; tracks_serials: boolean; tracks_returns: boolean };

describe("how a business sells, and whether it delivers", () => {
  let db: Db;
  let owner: string;

  const settings = async (organizationId: string) =>
    (
      await db.query<Settings>(
        `select selling_mode, does_delivery, tracks_serials, tracks_returns from public.organizations where id = $1`,
        [organizationId]
      )
    ).rows[0];
  const create = async (name: string, mode: string | null, delivery: boolean | null, serials = false) =>
    (
      (await call(db, owner, `select * from public.create_organization($1, null, false, $2, $3, $4)`, [
        name,
        serials,
        mode,
        delivery
      ])) as { id: string }[]
    )[0];
  const set = (organizationId: string, returns: boolean, serials: boolean, mode: string | null, delivery: boolean | null) =>
    call(db, owner, `select public.set_business_features($1, $2, $3, $4, $5)`, [organizationId, returns, serials, mode, delivery]);

  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db, "owner@example.com");
  });

  it("defaults to counting goods with delivery on", async () => {
    const depot = (await call(db, owner, `select * from public.create_organization('Plain Depot')`))[0] as { id: string };
    expect(await settings(depot.id)).toMatchObject({ selling_mode: "quantity", does_delivery: true, tracks_serials: false });
  });

  it("a serial shop always has serial numbers on, even if not asked for", async () => {
    const shop = await create("Phone Shop", "serial", false);
    expect(await settings(shop.id)).toMatchObject({ selling_mode: "serial", does_delivery: false, tracks_serials: true });
    // ...and can still sell accessories counted by quantity.
    await expect(saveProduct(db, owner, shop.id, { name: "Charger", unit: "piece" })).resolves.toBeTruthy();
    await expect(saveProduct(db, owner, shop.id, { name: "Phone", unit: "phone", tracksSerials: true })).resolves.toBeTruthy();
  });

  it("refuses a selling mode it does not know", async () => {
    await expect(create("Odd Shop", "barter", true)).rejects.toThrow(/Choose how the business sells/);
  });

  it("switching to serial mode turns serial numbers on; it cannot be turned off while in serial mode", async () => {
    const shop = await create("Switching Shop", "quantity", true);
    await set(shop.id, false, false, "serial", null);
    expect(await settings(shop.id)).toMatchObject({ selling_mode: "serial", tracks_serials: true, does_delivery: true });
    await set(shop.id, false, false, null, null);
    expect((await settings(shop.id)).tracks_serials).toBe(true);
    await set(shop.id, false, false, "quantity", null);
    expect(await settings(shop.id)).toMatchObject({ selling_mode: "quantity", tracks_serials: false });
  });

  it("the three-argument call keeps the selling mode and delivery as they are", async () => {
    const shop = await create("Kept Shop", "serial", true);
    await call(db, owner, `select public.set_business_features($1, true, true)`, [shop.id]);
    expect(await settings(shop.id)).toMatchObject({ selling_mode: "serial", does_delivery: true, tracks_returns: true });
  });

  it("delivery cannot be switched off while a trip is loading or on the road", async () => {
    const shop = await createBusiness(db, owner, "Delivering Shop");
    const product = await saveProduct(db, owner, shop.id, { name: "Rice", unit: "bag", sellingPrice: 100 });
    await receiveStock(db, owner, shop.id, [{ product_id: product, quantity: 10 }]);
    const customer = await saveCustomer(db, owner, shop.id, { name: "Ada" });
    const order = await createOrder(db, owner, shop.id, customer, [{ product_id: product, quantity: 2 }]);
    const trip = await createTrip(db, owner, shop.id, [order.id]);

    await expect(set(shop.id, true, true, null, false)).rejects.toThrow(/while a trip is loading or on the road/);
    await call(db, owner, `select public.cancel_dispatch_trip($1)`, [trip.id]);
    await set(shop.id, true, true, null, false);
    expect((await settings(shop.id)).does_delivery).toBe(false);
  });

  it("only owners and admins can change it, and every change is in the activity log", async () => {
    const shop = await create("Logged Shop", "quantity", true);
    const staff = await createUser(db, "staff@example.com");
    await expect(
      call(db, staff, `select public.set_business_features($1, true, false, 'serial', true)`, [shop.id])
    ).rejects.toThrow();
    await set(shop.id, true, false, "serial", false);
    const log = await db.query<{ old_values: Settings; new_values: Settings }>(
      `select old_values, new_values from public.audit_logs
       where organization_id = $1 and action = 'set_business_features'`,
      [shop.id]
    );
    expect(log.rows[0].old_values).toMatchObject({ selling_mode: "quantity", does_delivery: true });
    expect(log.rows[0].new_values).toMatchObject({ selling_mode: "serial", does_delivery: false, tracks_serials: true });
  });
});
