import { beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  call,
  createBusiness,
  createTestDb,
  createUser,
  mainLocation,
  returnableId,
  saveCustomer,
  saveProduct,
  type Db
} from "./harness";

describe("what a business sells", () => {
  let db: Db;
  let owner: string;
  let staff: string;

  const features = async (organizationId: string) =>
    (
      await db.query<{ tracks_returns: boolean; tracks_serials: boolean }>(
        `select tracks_returns, tracks_serials from public.organizations where id = $1`,
        [organizationId]
      )
    ).rows[0];
  const setFeatures = (user: string, organizationId: string, returns: boolean, serials: boolean) =>
    call(db, user, `select public.set_business_features($1, $2, $3)`, [organizationId, returns, serials]);

  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db, "owner@example.com");
    staff = await createUser(db, "staff@example.com");
  });

  it("records the answers given at sign-up, and defaults to returns on, serials off", async () => {
    const shop = await createBusiness(db, owner, "Simple Shop", { returns: false, serials: false });
    expect(await features(shop.id)).toEqual({ tracks_returns: false, tracks_serials: false });
    const plain = (await call(db, owner, `select * from public.create_organization('Default Depot')`))[0] as { id: string };
    expect(await features(plain.id)).toEqual({ tracks_returns: true, tracks_serials: false });
  });

  it("refuses products that need a switched-off feature", async () => {
    const shop = await createBusiness(db, owner, "Plain Shop", { returns: false, serials: false });
    await expect(saveProduct(db, owner, shop.id, { name: "Cola", returnItem: "Empty crate" })).rejects.toThrow(
      /Returns are switched off for this business/
    );
    await expect(saveProduct(db, owner, shop.id, { name: "Phone", tracksSerials: true })).rejects.toThrow(
      /Serial numbers are switched off for this business/
    );
    await expect(saveProduct(db, owner, shop.id, { name: "Charger" })).resolves.toBeTruthy();

    await setFeatures(owner, shop.id, true, true);
    await expect(saveProduct(db, owner, shop.id, { name: "Phone", tracksSerials: true })).resolves.toBeTruthy();
  });

  it("only lets an owner or admin change them, and not while they are in use", async () => {
    const depot = await createBusiness(db, owner, "Busy Depot");
    await addMember(db, owner, depot.id, { id: staff, email: "staff@example.com" }, "staff");
    await expect(setFeatures(staff, depot.id, false, false)).rejects.toThrow(/do not have permission/);

    const cola = await saveProduct(db, owner, depot.id, { name: "Cola", sellingPrice: 100, returnItem: "Empty crate" });
    const phone = await saveProduct(db, owner, depot.id, { name: "Phone", sellingPrice: 100, tracksSerials: true });
    await expect(setFeatures(owner, depot.id, false, true)).rejects.toThrow(/while Cola still needs something brought back/);
    await expect(setFeatures(owner, depot.id, true, false)).rejects.toThrow(/while Phone is tracked by serial number/);

    // A customer balance also keeps returns on.
    await call(db, owner, `select public.set_product_active($1, false)`, [cola]);
    const customer = await saveCustomer(db, owner, depot.id, { name: "Ada" });
    await call(db, owner, `select public.record_customer_opening_debt($1, $2, $3, 4, null)`, [
      depot.id,
      customer,
      await returnableId(db, depot.id, "Empty crate")
    ]);
    await expect(setFeatures(owner, depot.id, false, true)).rejects.toThrow(/customers still owe returnables/);

    await call(db, owner, `select public.set_product_active($1, false)`, [phone]);
    await setFeatures(owner, depot.id, true, false);
    expect(await features(depot.id)).toEqual({ tracks_returns: true, tracks_serials: false });
  });
});

describe("stock write-offs", () => {
  it("cannot be made any more: stock only changes through deliveries and orders", async () => {
    const db = await createTestDb();
    const owner = await createUser(db, "owner@example.com");
    const shop = await createBusiness(db, owner, "Rice Shop");
    const rice = await saveProduct(db, owner, shop.id, { name: "Rice", unit: "bag", sellingPrice: 100 });
    await expect(
      call(
        db,
        owner,
        `select public.record_stock_adjustment($1, $2, public_today(), $3, 'subtract', 1, 'damaged', null, null)`,
        [shop.id, await mainLocation(db, shop.id), rice]
      )
    ).rejects.toThrow(/permission denied/);
  });
});
