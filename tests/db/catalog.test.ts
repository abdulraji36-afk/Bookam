import { beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  as,
  createBusiness,
  createTestDb,
  createUser,
  mainLocation,
  receiveStock,
  saveCustomer,
  saveProduct,
  setPlan,
  type Db
} from "./harness";

describe("products, customers and stock", () => {
  let db: Db;
  let owner: string;
  let staff: string;
  let rival: string;
  let org: { id: string; slug: string };
  let rivalOrg: { id: string; slug: string };
  let cola: string;
  let water: string;

  const stockOf = async (productId: string, locationId?: string) => {
    const rows = await as(db, owner, (s) =>
      s.query<{ on_hand: string }>(
        `select sum(on_hand)::text as on_hand from public.product_stock_levels
         where product_id = $1 and ($2::uuid is null or location_id = $2)`,
        [productId, locationId ?? null]
      )
    );
    return Number(rows[0].on_hand);
  };

  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db, "owner@example.com");
    staff = await createUser(db, "staff@example.com");
    rival = await createUser(db, "rival@example.com");
    org = await createBusiness(db, owner, "Depot One");
    rivalOrg = await createBusiness(db, rival, "Rival Depot");
    await addMember(db, owner, org.id, { id: staff, email: "staff@example.com" }, "staff");

    cola = await saveProduct(db, owner, org.id, {
      name: "Cola 50cl",
      sku: "COLA-50",
      sellingPrice: 4200,
      costPrice: 3600,
      lowStock: 20,
      returnItem: "Empty crate"
    });
    water = await saveProduct(db, owner, org.id, { name: "Water 75cl", unit: "pack", sellingPrice: 1800 });
  });

  it("lets the business decide per product whether something must come back", async () => {
    const rows = await as(db, staff, (s) =>
      s.query<{ name: string; returns: string | null }>(
        `select p.name, r.name as returns
         from public.products p left join public.returnable_items r on r.id = p.returnable_item_id
         order by p.name`
      )
    );
    expect(rows).toEqual([
      { name: "Cola 50cl", returns: "Empty crate" },
      { name: "Water 75cl", returns: null }
    ]);
  });

  it("shares one returnable between products instead of duplicating it", async () => {
    await saveProduct(db, owner, org.id, { name: "Orange 50cl", returnItem: " empty CRATE " });
    const count = await db.query<{ n: number }>(
      `select count(*)::int as n from public.returnable_items where organization_id = $1`,
      [org.id]
    );
    expect(count.rows[0].n).toBe(1);
  });

  it("can switch a product between the two flows", async () => {
    await saveProduct(db, owner, org.id, { id: water, name: "Water 75cl", unit: "pack", returnItem: "Dispenser bottle" });
    await saveProduct(db, owner, org.id, { id: water, name: "Water 75cl", unit: "pack", sellingPrice: 1800 });
    const row = await db.query<{ returnable_item_id: string | null }>(
      `select returnable_item_id from public.products where id = $1`,
      [water]
    );
    expect(row.rows[0].returnable_item_id).toBeNull();
  });

  it("refuses duplicate names and codes, and a return product without a return item", async () => {
    await expect(saveProduct(db, owner, org.id, { name: " cola 50CL " })).rejects.toThrow(/already have a product/);
    await expect(saveProduct(db, owner, org.id, { name: "Cola 35cl", sku: "cola-50" })).rejects.toThrow(
      /already used/
    );
    await expect(
      as(db, owner, (s) =>
        s.query(`select public.save_product($1, null, 'Lemon', null, 'crate', null, null, null, true, '')`, [org.id])
      )
    ).rejects.toThrow(/must bring back/);
    await expect(saveProduct(db, owner, org.id, { name: "Bad", sellingPrice: -1 })).rejects.toThrow(/negative/);
  });

  it("keeps buying costs away from staff", async () => {
    const forOwner = await as(db, owner, (s) => s.query(`select cost_price::float from public.product_costs`));
    const forStaff = await as(db, staff, (s) => s.query(`select cost_price::float from public.product_costs`));
    expect(forOwner).toEqual([{ cost_price: 3600 }]);
    expect(forStaff).toEqual([]);
  });

  it("only lets owners and admins change products", async () => {
    await expect(saveProduct(db, staff, org.id, { name: "Staff Product" })).rejects.toThrow(
      /do not have permission/
    );
    await expect(
      as(db, staff, (s) => s.query(`select public.set_product_active($1, false)`, [cola]))
    ).rejects.toThrow(/do not have permission/);
    await expect(saveProduct(db, rival, org.id, { name: "Rival Product" })).rejects.toThrow(
      /do not have permission/
    );
    await expect(
      saveProduct(db, rival, rivalOrg.id, { id: cola, name: "Stolen Cola" })
    ).rejects.toThrow(/Product not found/);
  });

  it("lets staff add customers but not edit them", async () => {
    const customer = await saveCustomer(db, staff, org.id, { name: "Mama Tunde Stores", area: "Ikeja" });
    await expect(
      saveCustomer(db, staff, org.id, { id: customer, name: "Renamed" })
    ).rejects.toThrow(/do not have permission/);
    await expect(
      saveCustomer(db, owner, org.id, { name: "mama tunde stores", area: "IKEJA" })
    ).rejects.toThrow(/already have a customer/);
    // Same name in another area is a different customer.
    await expect(
      saveCustomer(db, owner, org.id, { name: "Mama Tunde Stores", area: "Yaba" })
    ).resolves.toBeTruthy();
    await saveCustomer(db, owner, org.id, { id: customer, name: "Mama Tunde Stores", area: "Ikeja", phone: "0800" });
  });

  it("adds received stock to the ledger and numbers receipts per business", async () => {
    expect(await stockOf(cola)).toBe(0);

    const first = await receiveStock(db, staff, org.id, [
      { product_id: cola, quantity: 100 },
      { product_id: water, quantity: 40 }
    ]);
    const second = await receiveStock(db, owner, org.id, [{ product_id: cola, quantity: 25.5 }]);
    const theirs = await receiveStock(db, rival, rivalOrg.id, [
      { product_id: await saveProduct(db, rival, rivalOrg.id, { name: "Gas 12kg" }), quantity: 5 }
    ]);

    expect(first.receipt_no).toMatch(/^STK-\d{8}-0001$/);
    expect(second.receipt_no).toMatch(/^STK-\d{8}-0002$/);
    expect(theirs.receipt_no).toMatch(/^STK-\d{8}-0001$/);
    expect(await stockOf(cola)).toBe(125.5);
    expect(await stockOf(water)).toBe(40);
  });

  it("tracks stock separately for each location", async () => {
    await setPlan(db, org.id, "business");
    const annex = (
      await as(db, owner, (s) =>
        s.query<{ id: string }>(`select public.create_location($1, 'Annex') as id`, [org.id])
      )
    )[0].id;
    await receiveStock(db, owner, org.id, [{ product_id: cola, quantity: 10 }], { locationId: annex });

    expect(await stockOf(cola, annex)).toBe(10);
    expect(await stockOf(cola, await mainLocation(db, org.id))).toBe(125.5);
    expect(await stockOf(cola)).toBe(135.5);
  });

  it("saves nothing when any part of a receipt is wrong", async () => {
    const before = await db.query<{ n: number }>(`select count(*)::int as n from public.stock_receipts`);
    const rivalLocation = await mainLocation(db, rivalOrg.id);
    const rivalProduct = (
      await db.query<{ id: string }>(`select id from public.products where organization_id = $1`, [rivalOrg.id])
    ).rows[0].id;

    await expect(receiveStock(db, owner, org.id, [])).rejects.toThrow(/at least one product/);
    await expect(receiveStock(db, owner, org.id, [{ product_id: cola, quantity: 0 }])).rejects.toThrow(
      /greater than zero/
    );
    await expect(
      receiveStock(db, owner, org.id, [
        { product_id: cola, quantity: 1 },
        { product_id: cola, quantity: 2 }
      ])
    ).rejects.toThrow(/more than once/);
    await expect(
      receiveStock(db, owner, org.id, [
        { product_id: cola, quantity: 1 },
        { product_id: rivalProduct, quantity: 1 }
      ])
    ).rejects.toThrow(/not an active product/);
    await expect(
      receiveStock(db, owner, org.id, [{ product_id: cola, quantity: 1 }], { locationId: rivalLocation })
    ).rejects.toThrow(/one of your locations/);
    await expect(
      receiveStock(db, owner, org.id, [{ product_id: cola, quantity: 1 }], { date: "2999-01-01" })
    ).rejects.toThrow(/future/);
    await expect(
      receiveStock(db, rival, org.id, [{ product_id: cola, quantity: 1 }])
    ).rejects.toThrow(/do not have permission/);

    const after = await db.query<{ n: number }>(`select count(*)::int as n from public.stock_receipts`);
    expect(after.rows[0].n).toBe(before.rows[0].n);
    expect(await stockOf(cola)).toBe(135.5);
  });

  it("stops stock being received for a product that was switched off", async () => {
    await as(db, owner, (s) => s.query(`select public.set_product_active($1, false)`, [water]));
    await expect(receiveStock(db, owner, org.id, [{ product_id: water, quantity: 1 }])).rejects.toThrow(
      /Water 75cl is not an active product/
    );
  });
});
