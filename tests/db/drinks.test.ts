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
  returnableId,
  returnableTotals,
  saveCustomer,
  saveProduct,
  type Db
} from "./harness";

describe("drinks, the Bilikis way", () => {
  let db: Db;
  let owner: string;
  let staff: string;
  let depot: { id: string };
  let rgb: string;
  let pet: string;
  let empties: string;

  const totals = () => returnableTotals(db, depot.id, "Empties");
  const onHand = async (productId: string) =>
    Number(
      (
        await db.query<{ on_hand: string }>(
          `select coalesce(sum(qty_in - qty_out), 0)::text as on_hand from public.stock_movements where product_id = $1`,
          [productId]
        )
      ).rows[0].on_hand
    );
  const deliver = async (
    user: string,
    items: { product_id: string; quantity: number }[],
    emptiesGiven: number,
    reference: string | null = "NBC-1001"
  ) =>
    (
      (await call(
        db,
        user,
        `select * from public.record_stock_delivery($1, $2, public_today(), 'NBC', $3, null, $4::jsonb, $5, $6)`,
        [depot.id, await mainLocation(db, depot.id), reference, JSON.stringify(items), emptiesGiven, empties]
      )) as { id: string; receipt_no: string; exchange_no: string | null }[]
    )[0];

  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db, "owner@example.com");
    staff = await createUser(db, "staff@example.com");
    depot = (
      (await call(db, owner, `select * from public.create_organization('Bilikis Drinks', 'Drinks depot', false, false, 'quantity', true, true)`)) as {
        id: string;
      }[]
    )[0];
    await addMember(db, owner, depot.id, { id: staff, email: "staff@example.com" }, "staff");
    empties = await returnableId(db, depot.id, "Empties");
  });

  it("a drinks business starts with returns on and one pool called Empties", async () => {
    const org = (
      await db.query<{ sells_drinks: boolean; tracks_returns: boolean }>(
        `select sells_drinks, tracks_returns from public.organizations where id = $1`,
        [depot.id]
      )
    ).rows[0];
    expect(org).toEqual({ sells_drinks: true, tracks_returns: true });
    const items = await db.query(`select name from public.returnable_items where organization_id = $1`, [depot.id]);
    expect(items.rows).toEqual([{ name: "Empties" }]);

    // Returns cannot be switched off while the business sells drinks.
    await call(db, owner, `select public.set_business_features($1, false, false)`, [depot.id]);
    expect(
      (await db.query<{ tracks_returns: boolean }>(`select tracks_returns from public.organizations where id = $1`, [depot.id]))
        .rows[0].tracks_returns
    ).toBe(true);
  });

  it("a drink cannot be saved without its selling price and buying cost", async () => {
    await expect(saveProduct(db, owner, depot.id, { name: "Coke 50cl RGB", sellingPrice: 4200 })).rejects.toThrow(
      /Enter the selling price and the buying cost/
    );
    await expect(saveProduct(db, owner, depot.id, { name: "Coke 50cl RGB", costPrice: 3900 })).rejects.toThrow(
      /Enter the selling price and the buying cost/
    );
    rgb = await saveProduct(db, owner, depot.id, {
      name: "Coke 50cl RGB",
      unit: "crate",
      sellingPrice: 4200,
      costPrice: 3900,
      returnItem: "Empties"
    });
    pet = await saveProduct(db, owner, depot.id, { name: "Coke 50cl PET", unit: "pack", sellingPrice: 3000, costPrice: 2700 });
    const linked = await db.query<{ returnable_item_id: string | null }>(
      `select returnable_item_id from public.products where id = any($1::uuid[]) order by name desc`,
      [[rgb, pet]]
    );
    expect(linked.rows.map((row) => row.returnable_item_id)).toEqual([empties, null]);
  });

  it("opening empties are an ordinary adjustment", async () => {
    await adjust(db, owner, depot.id, { returnableId: empties, direction: "add", quantity: 500, reason: "opening_count" });
    expect(await totals()).toEqual({ holding: 500, owed: 0 });
  });

  it("a delivery takes empties in the same go, and only as many as were given", async () => {
    const delivery = await deliver(staff, [{ product_id: rgb, quantity: 500 }], 250);
    expect(delivery.receipt_no).toMatch(/^STK-/);
    expect(delivery.exchange_no).toMatch(/^EXC-/);
    expect(await onHand(rgb)).toBe(500);
    expect(await totals()).toEqual({ holding: 250, owed: 0 });

    const exchange = await db.query<{ receipt_id: string; reference: string }>(
      `select receipt_id, reference from public.supplier_exchanges where exchange_no = $1`,
      [delivery.exchange_no]
    );
    expect(exchange.rows[0]).toEqual({ receipt_id: delivery.id, reference: "NBC-1001" });

    // No empties given: just the goods.
    const petOnly = await deliver(staff, [{ product_id: pet, quantity: 40 }], 0, "NBC-1002");
    expect(petOnly.exchange_no).toBeNull();
    expect(await totals()).toEqual({ holding: 250, owed: 0 });
  });

  it("cannot give more empties than are in store, and then saves nothing at all", async () => {
    await expect(deliver(staff, [{ product_id: rgb, quantity: 100 }], 300, "NBC-1003")).rejects.toThrow(
      /You only have 250 Empties in store here, so 300 cannot be taken/
    );
    expect(await onHand(rgb)).toBe(500);
    const receipts = await db.query(`select 1 from public.stock_receipts where reference = 'NBC-1003'`);
    expect(receipts.rows).toHaveLength(0);
  });

  it("a drinks delivery needs the supplier's reference", async () => {
    await expect(deliver(staff, [{ product_id: pet, quantity: 1 }], 0, "  ")).rejects.toThrow(
      /Enter the supplier's delivery reference/
    );
  });

  it("voiding a delivery gives back the empties taken with it", async () => {
    const delivery = await deliver(owner, [{ product_id: rgb, quantity: 10 }], 10, "NBC-1004");
    expect(await totals()).toEqual({ holding: 240, owed: 0 });
    await call(db, owner, `select public.void_stock_receipt($1, 'Wrong delivery entered')`, [delivery.id]);
    expect(await totals()).toEqual({ holding: 250, owed: 0 });
    const exchange = await db.query<{ void_reason: string }>(
      `select void_reason from public.supplier_exchanges where exchange_no = $1`,
      [delivery.exchange_no]
    );
    expect(exchange.rows[0].void_reason).toBe("Wrong delivery entered");
  });

  it("customers owe the empties a trip did not bring back, and an owner records them later", async () => {
    const mama = await saveCustomer(db, owner, depot.id, { name: "Mama Tunde" });
    // An order is either RGB or PET; a customer taking both gets two orders.
    await expect(
      createOrder(db, staff, depot.id, mama, [
        { product_id: rgb, quantity: 50 },
        { product_id: pet, quantity: 5 }
      ])
    ).rejects.toThrow(/An order is either RGB or PET/);
    const order = await createOrder(db, staff, depot.id, mama, [{ product_id: rgb, quantity: 50 }]);
    const petOrder = await createOrder(db, staff, depot.id, mama, [{ product_id: pet, quantity: 5 }]);
    // Both go out on the same trip.
    const trip = await createTrip(db, staff, depot.id, [order.id, petOrder.id]);
    await call(db, staff, `select public.dispatch_trip($1)`, [trip.id]);
    // Only the RGB crates are owed back; PET packs are not.
    expect(await owedBy(db, mama)).toBe(50);

    await call(db, staff, `select public.record_trip_returns($1, public_today(), $2::jsonb)`, [
      trip.id,
      JSON.stringify([{ order_id: order.id, returnable_item_id: empties, quantity: 30 }])
    ]);
    expect(await owedBy(db, mama)).toBe(20);
    expect(await totals()).toEqual({ holding: 280, owed: 20 });

    // The old "customer brought back empties" form is closed for drinks:
    // returns go against the order that came back short.
    const location = await mainLocation(db, depot.id);
    await expect(
      call(db, staff, `select public.record_customer_empties_return($1, $2, public_today(), $3, $4, 15, null)`, [
        depot.id,
        location,
        empties,
        mama
      ])
    ).rejects.toThrow(/against their order on the Empty shortages page/);

    const line = (
      await db.query<{ id: string }>(`select id from public.trip_return_lines where order_id = $1`, [order.id])
    ).rows[0].id;
    const followUp = (quantity: number, user = owner) =>
      call(db, user, `select public.record_empties_followup($1, $2, public_today(), 'Brought to the depot')`, [
        line,
        quantity
      ]);
    // Staff record trip returns; follow-ups are for owners and admins.
    await expect(followUp(15, staff)).rejects.toThrow();
    await followUp(15);
    expect(await owedBy(db, mama)).toBe(5);
    expect(await totals()).toEqual({ holding: 295, owed: 5 });
    await expect(followUp(6)).rejects.toThrow(/Only 5 empties are still owed on ORD-/);

    // Another business cannot record against this one's orders.
    const other = await createUser(db, "other@example.com");
    await expect(followUp(1, other)).rejects.toThrow();
  });

  it("switching drinks on later creates the Empties pool once", async () => {
    const shop = (
      (await call(db, owner, `select * from public.create_organization('Late Drinks', null, false)`)) as { id: string }[]
    )[0];
    await call(db, owner, `select public.set_business_features($1, false, false, null, null, true)`, [shop.id]);
    await call(db, owner, `select public.set_business_features($1, false, false, null, null, true)`, [shop.id]);
    const items = await db.query(`select name from public.returnable_items where organization_id = $1`, [shop.id]);
    expect(items.rows).toEqual([{ name: "Empties" }]);
  });
});
