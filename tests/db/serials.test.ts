import { beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  call,
  createBusiness,
  createOrder,
  createTestDb,
  createTrip,
  createUser,
  owedBy,
  receiveStock,
  saveCustomer,
  saveProduct,
  setPlan,
  unitIds,
  type Db
} from "./harness";

describe("serial-numbered products, counter sales and walk-in buyers", () => {
  let db: Db;
  let owner: string;
  let staff: string;
  let rival: string;
  let org: { id: string; slug: string };
  let rivalOrg: { id: string; slug: string };
  let iphone: string; // tracked, 12 months warranty
  let charger: string; // plain
  let cola: string; // must come back
  let ada: string;

  const one = async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await db.query<T>(sql, params)).rows[0];
  const stockOf = async (productId: string) =>
    Number((await one<{ n: string }>(`select coalesce(sum(qty_in - qty_out), 0)::text as n from public.stock_movements where product_id = $1`, [productId])).n);
  const unitsOf = async (productId: string) =>
    (
      await db.query<{ serial_no: string; colour: string | null; condition: string; status: string }>(
        `select serial_no, colour, condition::text, status::text from public.product_units where product_id = $1 order by serial_no`,
        [productId]
      )
    ).rows;
  const statusOf = async (orderId: string) =>
    (await one<{ status: string }>(`select status::text from public.orders where id = $1`, [orderId])).status;
  const phones = (...serials: [string, string?, string?][]) => [
    { product_id: iphone, units: serials.map(([serial, colour, condition]) => ({ serial, colour, condition })) }
  ];

  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db, "owner@example.com", "Ada Obi");
    staff = await createUser(db, "staff@example.com");
    rival = await createUser(db, "rival@example.com");
    org = await createBusiness(db, owner, "Gadget Hub");
    rivalOrg = await createBusiness(db, rival, "Rival Gadgets");
    await addMember(db, owner, org.id, { id: staff, email: "staff@example.com" }, "staff");

    iphone = await saveProduct(db, owner, org.id, {
      name: "iPhone 15 128GB",
      unit: "piece",
      sellingPrice: 1_150_000,
      tracksSerials: true,
      warrantyMonths: 12
    });
    charger = await saveProduct(db, owner, org.id, { name: "USB-C charger", unit: "piece", sellingPrice: 8_000 });
    cola = await saveProduct(db, owner, org.id, { name: "Cola 50cl", sellingPrice: 4_200, returnItem: "Empty crate" });
    ada = await saveCustomer(db, owner, org.id, { name: "Ada Stores", phone: "0803" });
    await receiveStock(db, owner, org.id, [
      { product_id: charger, quantity: 20 },
      { product_id: cola, quantity: 50 }
    ]);
  });

  it("stocks a tracked product one unit at a time, with colour and condition", async () => {
    const receipt = await receiveStock(
      db,
      staff,
      org.id,
      phones(["356 789 1012 3451", "Black"], ["3567891012345 2", "Black", "uk_used"], ["356789101234553", "Blue", "nigerian_used"])
    );
    expect(receipt.receipt_no).toMatch(/^STK-/);
    expect(await stockOf(iphone)).toBe(3);
    expect(await unitsOf(iphone)).toEqual([
      { serial_no: "3567891012345 1".replace(/ /g, ""), colour: "Black", condition: "brand_new", status: "in_stock" },
      { serial_no: "35678910123452", colour: "Black", condition: "uk_used", status: "in_stock" },
      { serial_no: "356789101234553", colour: "Blue", condition: "nigerian_used", status: "in_stock" }
    ]);
    const item = await one<{ quantity: string }>(`select quantity::text from public.stock_receipt_items where receipt_id = $1`, [receipt.id]);
    expect(Number(item.quantity)).toBe(3);
  });

  it("refuses bad or duplicate serial numbers, and saves nothing", async () => {
    const before = await stockOf(iphone);
    await expect(receiveStock(db, staff, org.id, [{ product_id: iphone, quantity: 2 }])).rejects.toThrow(
      /Enter the serial number of each iPhone 15 128GB received/
    );
    await expect(receiveStock(db, staff, org.id, [{ product_id: iphone, units: [] }])).rejects.toThrow(
      /Enter the serial number of each/
    );
    await expect(receiveStock(db, staff, org.id, phones(["AB"]))).rejects.toThrow(/3 to 40 characters/);
    await expect(receiveStock(db, staff, org.id, phones(["SN-1001"], ["sn-1001"]))).rejects.toThrow(
      /Serial number SN-1001 is entered twice/
    );
    await expect(receiveStock(db, staff, org.id, phones(["35678910123452"]))).rejects.toThrow(
      /35678910123452 is already in your stock/
    );
    await expect(receiveStock(db, staff, org.id, phones(["SN-2000", "Red", "refurbished"]))).rejects.toThrow(
      /Brand new, UK used or Nigerian used/
    );
    await expect(
      receiveStock(db, staff, org.id, [{ product_id: charger, units: [{ serial: "CH-1" }] }])
    ).rejects.toThrow(/USB-C charger is not tracked by serial number/);
    expect(await stockOf(iphone)).toBe(before);
  });

  it("lets two businesses use the same serial number independently", async () => {
    const theirs = await saveProduct(db, rival, rivalOrg.id, { name: "iPhone 15 128GB", sellingPrice: 1, tracksSerials: true });
    await receiveStock(db, rival, rivalOrg.id, [{ product_id: theirs, units: [{ serial: "35678910123452" }] }]);
    expect(await stockOf(theirs)).toBe(1);
    const visible = await call(db, owner, `select count(*)::int as n from public.product_units`);
    expect(visible).toEqual([{ n: 3 }]);
  });

  it("sells the exact units chosen, and will not sell one twice", async () => {
    const [first, second, third] = await unitIds(db, iphone);
    const order = await createOrder(db, staff, org.id, ada, [
      { product_id: iphone, unit_ids: [first, second] },
      { product_id: charger, quantity: 2 }
    ]);
    expect(await stockOf(iphone)).toBe(1);
    expect((await unitsOf(iphone)).map((unit) => unit.status)).toEqual(["reserved", "reserved", "in_stock"]);

    await expect(createOrder(db, staff, org.id, ada, [{ product_id: iphone, unit_ids: [first] }])).rejects.toThrow(
      /has been sold, is on another order/
    );
    await expect(createOrder(db, staff, org.id, ada, [{ product_id: iphone, quantity: 1 }])).rejects.toThrow(
      /Choose which iPhone 15 128GB are going out, by serial number/
    );
    await expect(createOrder(db, staff, org.id, ada, [{ product_id: charger, unit_ids: [third] }])).rejects.toThrow(
      /USB-C charger is not tracked by serial number/
    );
    await expect(createOrder(db, staff, org.id, ada, [{ product_id: iphone, unit_ids: [third, third] }])).rejects.toThrow(
      /same unit is chosen twice/
    );

    // Editing swaps a unit: the dropped one goes back, the new one is held.
    await call(db, staff, `select public.update_order($1, public_today(), $2, 'cash', null, $3::jsonb)`, [
      order.id,
      ada,
      JSON.stringify([{ product_id: iphone, unit_ids: [first, third] }])
    ]);
    expect((await unitsOf(iphone)).map((unit) => unit.status)).toEqual(["reserved", "in_stock", "reserved"]);
    expect(await stockOf(charger)).toBe(20);

    // Cancelling puts both back.
    await call(db, staff, `select public.cancel_order($1)`, [order.id]);
    expect((await unitsOf(iphone)).map((unit) => unit.status)).toEqual(["in_stock", "in_stock", "in_stock"]);
    expect(await stockOf(iphone)).toBe(3);
  });

  it("refuses a unit from another location", async () => {
    await setPlan(db, org.id, "business");
    const annex = (await call(db, owner, `select public.create_location($1, 'Annex') as id`, [org.id]))[0].id as string;
    await receiveStock(db, owner, org.id, phones(["ANNEX-0001", "Gold"]), { locationId: annex });
    const annexUnit = (
      await one<{ id: string }>(`select id from public.product_units where serial_no = 'ANNEX-0001'`)
    ).id;
    await expect(createOrder(db, staff, org.id, ada, [{ product_id: iphone, unit_ids: [annexUnit] }])).rejects.toThrow(
      /at another location/
    );
  });

  it("marks units sold when the trip leaves, and back in stock when the order is voided", async () => {
    const [unit] = await unitIds(db, iphone);
    const order = await createOrder(db, staff, org.id, ada, [{ product_id: iphone, unit_ids: [unit] }]);
    const trip = await createTrip(db, staff, org.id, [order.id]);
    await call(db, staff, `select public.dispatch_trip($1)`, [trip.id]);
    expect(await statusOf(order.id)).toBe("completed");
    const sold = await one<{ status: string; sold: boolean }>(
      `select status::text, sold_at is not null as sold from public.product_units where id = $1`,
      [unit]
    );
    expect(sold).toEqual({ status: "sold", sold: true });

    await call(db, owner, `select public.void_order($1, 'Sold to the wrong customer')`, [order.id]);
    const back = await one<{ status: string; order_id: string | null }>(
      `select status::text, order_id from public.product_units where id = $1`,
      [unit]
    );
    expect(back).toEqual({ status: "in_stock", order_id: null });
  });

  it("lets a sold serial number be stocked again, and then the old sale cannot be voided", async () => {
    const unit = (await one<{ id: string }>(`select id from public.product_units where serial_no = '356789101234553'`)).id;
    const order = await createOrder(db, staff, org.id, null, [{ product_id: iphone, unit_ids: [unit] }], {
      handedOver: true,
      buyerName: "Walk-in Tunde"
    });
    // Bought back as a trade-in a week later.
    await receiveStock(db, staff, org.id, phones(["356789101234553", "Blue", "nigerian_used"]));
    const history = await db.query<{ status: string }>(
      `select status::text from public.product_units where serial_no = '356789101234553' order by created_at`
    );
    expect(history.rows.map((row) => row.status)).toEqual(["sold", "in_stock"]);
    await expect(call(db, owner, `select public.void_order($1, 'Testing the trade-in rule')`, [order.id])).rejects.toThrow(
      /356789101234553 has been stocked again/
    );
  });

  it("will not void a delivery whose units are on an order or sold", async () => {
    const receipt = await receiveStock(db, staff, org.id, phones(["VOID-0001", "Black"], ["VOID-0002", "Black"]));
    const unit = (await one<{ id: string }>(`select id from public.product_units where serial_no = 'VOID-0001'`)).id;
    const order = await createOrder(db, staff, org.id, ada, [{ product_id: iphone, unit_ids: [unit] }]);
    await expect(call(db, owner, `select public.void_stock_receipt($1, 'Entered by mistake')`, [receipt.id])).rejects.toThrow(
      /units it brought in are on an order or sold/
    );
    await call(db, staff, `select public.cancel_order($1)`, [order.id]);
    await call(db, owner, `select public.void_stock_receipt($1, 'Entered by mistake')`, [receipt.id]);
    expect(await db.query(`select 1 from public.product_units where serial_no like 'VOID-%'`)).toMatchObject({ rows: [] });
  });

  it("only switches tracking on or off while a product has no stock", async () => {
    await expect(
      saveProduct(db, owner, org.id, { id: charger, name: "USB-C charger", unit: "piece", sellingPrice: 8_000, tracksSerials: true })
    ).rejects.toThrow(/can only be switched on while USB-C charger has no stock/);
    const cable = await saveProduct(db, owner, org.id, { name: "Lightning cable", sellingPrice: 3_000 });
    await saveProduct(db, owner, org.id, { id: cable, name: "Lightning cable", sellingPrice: 3_000, tracksSerials: true });
    const row = await one<{ tracks_serials: boolean }>(`select tracks_serials from public.products where id = $1`, [cable]);
    expect(row.tracks_serials).toBe(true);
    await expect(
      saveProduct(db, owner, org.id, { name: "Warranty test", warrantyMonths: 200 })
    ).rejects.toThrow(/Warranty must be between 1 and 120 months/);
  });

  it("sells to a walk-in buyer over the counter", async () => {
    const order = await createOrder(db, staff, org.id, null, [{ product_id: charger, quantity: 1 }], {
      handedOver: true,
      buyerName: "  Tunde  ",
      buyerPhone: "0812"
    });
    expect(await statusOf(order.id)).toBe("completed");
    const summary = await call(
      db,
      staff,
      `select customer_name, customer_phone, handed_over_at is not null as handed_over from public.order_summaries where id = $1`,
      [order.id]
    );
    expect(summary).toEqual([{ customer_name: "Tunde", customer_phone: "0812", handed_over: true }]);

    const nameless = await createOrder(db, staff, org.id, null, [{ product_id: charger, quantity: 1 }]);
    const row = await call(db, staff, `select customer_name from public.order_summaries where id = $1`, [nameless.id]);
    expect(row).toEqual([{ customer_name: "Walk-in buyer" }]);
  });

  it("never lets a walk-in buyer take something that must come back", async () => {
    await expect(
      createOrder(db, staff, org.id, null, [{ product_id: cola, quantity: 1 }], { handedOver: true })
    ).rejects.toThrow(/Cola 50cl must be brought back, so it can only be sold to a saved customer/);
  });

  it("hands over a saved customer's order at the counter, and they owe the crates", async () => {
    expect(await owedBy(db, ada)).toBe(0);
    const order = await createOrder(db, staff, org.id, ada, [{ product_id: cola, quantity: 5 }]);
    await call(db, staff, `select public.hand_over_order($1)`, [order.id]);
    expect(await statusOf(order.id)).toBe("completed");
    expect(await owedBy(db, ada)).toBe(5);
    await expect(call(db, staff, `select public.hand_over_order($1)`, [order.id])).rejects.toThrow(
      /Only an order still waiting/
    );

    // An order already on a trip cannot be handed over at the counter.
    const onTrip = await createOrder(db, staff, org.id, ada, [{ product_id: charger, quantity: 1 }]);
    await createTrip(db, staff, org.id, [onTrip.id]);
    await expect(call(db, staff, `select public.hand_over_order($1)`, [onTrip.id])).rejects.toThrow(/Only an order still waiting/);
    await expect(call(db, rival, `select public.hand_over_order($1)`, [onTrip.id])).rejects.toThrow(/do not have permission/);

    // Voiding a counter sale wipes the debt it created.
    await call(db, owner, `select public.void_order($1, 'Rang it up twice')`, [order.id]);
    expect(await owedBy(db, ada)).toBe(0);
  });

  it("always keeps the ledger equal to the units in stock", async () => {
    const rows = await db.query<{ product_id: string; location_id: string; ledger: string; units: string }>(
      `select p.id as product_id, l.id as location_id,
              coalesce((select sum(qty_in - qty_out) from public.stock_movements m where m.product_id = p.id and m.location_id = l.id), 0)::text as ledger,
              (select count(*) from public.product_units u where u.product_id = p.id and u.location_id = l.id and u.status = 'in_stock')::text as units
       from public.products p join public.locations l on l.organization_id = p.organization_id
       where p.tracks_serials`
    );
    expect(rows.rows.length).toBeGreaterThan(0);
    for (const row of rows.rows) expect(Number(row.ledger)).toBe(Number(row.units));
  });
});
