import { beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  adjust,
  call,
  createBusiness,
  createOrder,
  createTestDb,
  createUser,
  mainLocation,
  receiveStock,
  returnableId,
  saveCustomer,
  saveProduct,
  unitIds,
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

describe("stock write-offs and corrections", () => {
  let db: Db;
  let owner: string;
  let staff: string;
  let rival: string;
  let org: { id: string; slug: string };
  let location: string;
  let water: string;
  let phone: string;
  let customer: string;

  const stockOf = async (productId: string) =>
    Number(
      (
        await db.query<{ n: string }>(
          `select coalesce(sum(qty_in - qty_out), 0)::text as n from public.stock_movements where product_id = $1`,
          [productId]
        )
      ).rows[0].n
    );
  const writeOff = (
    user: string,
    input: { product: string; direction?: string; quantity?: number | null; reason?: string; note?: string | null; units?: string[] | null }
  ) =>
    call(
      db,
      user,
      `select public.record_stock_adjustment($1, $2, public_today(), $3, $4, $5, $6::public.stock_adjustment_reason, $7, $8::uuid[]) as id`,
      [
        org.id,
        location,
        input.product,
        input.direction ?? "subtract",
        input.quantity ?? null,
        input.reason ?? "damaged",
        input.note ?? null,
        input.units ?? null
      ]
    ).then((rows) => rows[0].id as string);
  const voidIt = (user: string, id: string) =>
    call(db, user, `select public.void_stock_adjustment($1, 'Entered by mistake')`, [id]);

  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db, "owner@example.com");
    staff = await createUser(db, "staff@example.com");
    rival = await createUser(db, "rival@example.com");
    org = await createBusiness(db, owner, "Depot One");
    await createBusiness(db, rival, "Rival");
    await addMember(db, owner, org.id, { id: staff, email: "staff@example.com" }, "staff");
    location = await mainLocation(db, org.id);
    water = await saveProduct(db, owner, org.id, { name: "Water 75cl", unit: "pack", sellingPrice: 1800 });
    phone = await saveProduct(db, owner, org.id, { name: "iPhone 15", unit: "phone", sellingPrice: 1_000_000, tracksSerials: true });
    customer = await saveCustomer(db, owner, org.id, { name: "Ada" });
    await receiveStock(db, owner, org.id, [{ product_id: water, quantity: 50 }]);
    await receiveStock(db, owner, org.id, [
      { product_id: phone, units: [{ serial: "PH-0001", colour: "Black" }, { serial: "PH-0002", colour: "Black" }, { serial: "PH-0003" }] }
    ]);
  });

  it("takes damaged stock out of the ledger and keeps the record", async () => {
    const id = await writeOff(owner, { product: water, quantity: 6, reason: "damaged" });
    expect(await stockOf(water)).toBe(44);
    const row = (
      await db.query<{ quantity_delta: string; reason: string }>(
        `select quantity_delta::text, reason::text from public.stock_adjustments where id = $1`,
        [id]
      )
    ).rows[0];
    expect(row).toEqual({ quantity_delta: "-6.00", reason: "damaged" });
  });

  it("adds found stock, and needs a note to correct a count", async () => {
    await writeOff(owner, { product: water, direction: "add", quantity: 2, reason: "found" });
    expect(await stockOf(water)).toBe(46);
    await expect(writeOff(owner, { product: water, quantity: 1, reason: "count_correction" })).rejects.toThrow(/Add a note/);
    await writeOff(owner, { product: water, quantity: 1, reason: "count_correction", note: "Recount on Friday" });
    expect(await stockOf(water)).toBe(45);
  });

  it("refuses the wrong reason, too much, and anyone but an owner or admin", async () => {
    await expect(writeOff(owner, { product: water, direction: "add", quantity: 1, reason: "damaged" })).rejects.toThrow(
      /does not go with adding/
    );
    await expect(writeOff(owner, { product: water, quantity: 1, reason: "found" })).rejects.toThrow(/does not go with taking/);
    await expect(writeOff(owner, { product: water, quantity: 1000 })).rejects.toThrow(
      /Only 45 of Water 75cl is in stock here, so 1000 cannot be taken out/
    );
    await expect(writeOff(owner, { product: water, quantity: 0 })).rejects.toThrow(/greater than zero/);
    await expect(writeOff(staff, { product: water, quantity: 1 })).rejects.toThrow(/do not have permission/);
    await expect(writeOff(rival, { product: water, quantity: 1 })).rejects.toThrow(/do not have permission/);
  });

  it("writes off exact serial-numbered units, which then cannot be sold", async () => {
    const [first, second] = await unitIds(db, phone);
    await expect(writeOff(owner, { product: phone, quantity: 1 })).rejects.toThrow(/Choose which iPhone 15 are being taken out/);
    await expect(writeOff(owner, { product: phone, direction: "add", quantity: 1, reason: "found" })).rejects.toThrow(
      /receive them as stock with their serial numbers/
    );
    await expect(writeOff(owner, { product: water, units: [first] })).rejects.toThrow(/not tracked by serial number/);

    const id = await writeOff(owner, { product: phone, reason: "lost_or_stolen", units: [first] });
    expect(await stockOf(phone)).toBe(2);
    const status = (
      await db.query<{ status: string }>(`select status::text from public.product_units where id = $1`, [first])
    ).rows[0].status;
    expect(status).toBe("written_off");
    await expect(createOrder(db, staff, org.id, customer, [{ product_id: phone, unit_ids: [first] }])).rejects.toThrow(
      /has been sold, is on another order/
    );
    await expect(writeOff(owner, { product: phone, reason: "damaged", units: [first] })).rejects.toThrow(
      /not in stock at this location/
    );

    // Voiding brings the phone back.
    await voidIt(owner, id);
    expect(await stockOf(phone)).toBe(3);
    await expect(createOrder(db, staff, org.id, customer, [{ product_id: phone, unit_ids: [first, second] }])).resolves.toBeTruthy();
  });

  it("voids an addition only while that stock is still there", async () => {
    const lemon = await saveProduct(db, owner, org.id, { name: "Lemon", sellingPrice: 100 });
    const id = await writeOff(owner, { product: lemon, direction: "add", quantity: 5, reason: "found" });
    await createOrder(db, staff, org.id, customer, [{ product_id: lemon, quantity: 4 }]);
    await expect(voidIt(owner, id)).rejects.toThrow(/it added 5 of Lemon, but only 1 are in stock now/);
    await expect(voidIt(staff, id)).rejects.toThrow(/do not have permission/);
  });

  it("shows adjustments in their own column of the daily report", async () => {
    const rows = (await call(
      db,
      owner,
      `select name, opening::float, received::float, sold::float, adjusted::float, closing::float
       from public.daily_stock_report($1, public_today()) where name = 'Water 75cl'`,
      [org.id]
    )) as { opening: number; received: number; sold: number; adjusted: number; closing: number }[];
    expect(rows).toEqual([{ name: "Water 75cl", opening: 0, received: 50, sold: 0, adjusted: -5, closing: 45 }]);
  });

  it("keeps serial-numbered stock equal to the units in stock", async () => {
    const units = Number(
      (
        await db.query<{ n: string }>(
          `select count(*)::text as n from public.product_units where product_id = $1 and status = 'in_stock'`,
          [phone]
        )
      ).rows[0].n
    );
    expect(units).toBe(await stockOf(phone));
  });

  it("stays separate from returnables adjustments", async () => {
    // Returnables have their own add/subtract; this is only about products.
    const depot = await createBusiness(db, owner, "Crate Depot");
    const cola = await saveProduct(db, owner, depot.id, { name: "Cola", returnItem: "Empty crate" });
    await adjust(db, owner, depot.id, {
      returnableId: await returnableId(db, depot.id, "Empty crate"),
      direction: "add",
      quantity: 10,
      reason: "opening_count"
    });
    expect(await stockOf(cola)).toBe(0);
  });
});
