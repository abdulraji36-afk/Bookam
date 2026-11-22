import { beforeAll, describe, expect, it } from "vitest";
import { addMember, call, createTestDb, createUser, type Db } from "./harness";

// A normal goods business on the depot workspace: its own words, its own pool name.
describe("goods depot", () => {
  let db: Db;
  let owner: string;
  let staff: string;
  let depot: { id: string };
  let shop: { id: string };

  const trade = (user: string, org: string, value: string, name: string | null, returns = true) =>
    call(db, user, `select public.set_depot_trade($1, $2, $3, $4)`, [org, value, name, returns]);
  const state = async (org: string) =>
    (
      await db.query<{ trade: string; tracks_returns: boolean; pool: string }>(
        `select o.trade, o.tracks_returns,
                (select r.name from public.returnable_items r where r.organization_id = o.id order by r.created_at limit 1) as pool
         from public.organizations o where o.id = $1`,
        [org]
      )
    ).rows[0];

  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db, "owner@example.com");
    staff = await createUser(db, "staff@example.com");
    depot = (
      (await call(db, owner, `select * from public.create_organization('Gas Depot', null, false, false, 'quantity', true, true)`)) as {
        id: string;
      }[]
    )[0];
    shop = (
      (await call(db, owner, `select * from public.create_organization('Phone Shop', null, false, true, 'serial', false, false)`)) as {
        id: string;
      }[]
    )[0];
    await addMember(db, owner, depot.id, { id: staff, email: "staff@example.com" }, "staff");
  });

  it("a new depot starts as drinks, with Empties", async () => {
    expect(await state(depot.id)).toEqual({ trade: "drinks", tracks_returns: true, pool: "Empties" });
  });

  it("an owner makes it a goods depot and names what comes back", async () => {
    await expect(trade(staff, depot.id, "goods", "Empty cylinders")).rejects.toThrow(/permission|owner|admin/i);
    await trade(owner, depot.id, "goods", "  Empty   cylinders ");
    expect(await state(depot.id)).toEqual({ trade: "goods", tracks_returns: true, pool: "Empty cylinders" });
  });

  it("a goods depot with nothing coming back has returns off; the pool is kept for later", async () => {
    await trade(owner, depot.id, "goods", null, false);
    expect(await state(depot.id)).toEqual({ trade: "goods", tracks_returns: false, pool: "Returnables" });
    // Back to drinks: always with empties.
    await trade(owner, depot.id, "drinks", null, false);
    expect(await state(depot.id)).toEqual({ trade: "drinks", tracks_returns: true, pool: "Empties" });
  });

  it("refuses an unknown trade, a long name, and a business not on the depot workspace", async () => {
    await expect(trade(owner, depot.id, "phones", null)).rejects.toThrow(/drinks or goods/);
    await expect(trade(owner, depot.id, "goods", "x".repeat(41))).rejects.toThrow(/40 characters/);
    await expect(trade(owner, shop.id, "goods", "Boxes")).rejects.toThrow(/does not use the depot workspace/);
  });
});
