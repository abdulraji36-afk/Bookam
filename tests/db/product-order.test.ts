import { beforeAll, describe, expect, it } from "vitest";
import { addMember, call, createTestDb, createUser, type Db } from "./harness";

// Bilikis's saved product display order, kept per business.
describe("saved product order", () => {
  let db: Db;
  let owner: string;
  let staff: string;
  let depot: { id: string };
  let other: { id: string };
  let ids: string[];

  const save = (user: string, org: string, order: string[]) =>
    call(db, user, `select public.save_product_order($1, $2::uuid[])`, [org, order]);

  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db, "owner@example.com");
    staff = await createUser(db, "staff@example.com");
    depot = (
      (await call(db, owner, `select * from public.create_organization('Depot', null, false, false, 'quantity', true, true)`)) as {
        id: string;
      }[]
    )[0];
    other = (
      (await call(db, owner, `select * from public.create_organization('Other', null, false, false, 'quantity', false, false)`)) as {
        id: string;
      }[]
    )[0];
    await addMember(db, owner, depot.id, { id: staff, email: "staff@example.com" }, "staff");
    ids = [];
    for (const [org, name] of [
      [depot.id, "Fanta"],
      [depot.id, "Coke"],
      [other.id, "Elsewhere"]
    ]) {
      const result = await db.query<{ id: string }>(
        `insert into public.products (organization_id, name, unit, selling_price) values ($1, $2, 'pack', 100) returning id`,
        [org, name]
      );
      ids.push(result.rows[0].id);
    }
  });

  it("an owner saves the order; it is kept on the business", async () => {
    await save(owner, depot.id, [ids[1], ids[0]]);
    const saved = await db.query<{ product_order: string[] }>(`select product_order from public.organizations where id = $1`, [depot.id]);
    expect(saved.rows[0].product_order).toEqual([ids[1], ids[0]]);
  });

  it("staff cannot reorder; another business's product or a repeat is refused", async () => {
    await expect(save(staff, depot.id, [ids[0], ids[1]])).rejects.toThrow(/permission|owner|admin/i);
    await expect(save(owner, depot.id, [ids[0], ids[2]])).rejects.toThrow(/product list changed/);
    await expect(save(owner, depot.id, [ids[0], ids[0]])).rejects.toThrow(/appears twice/);
  });
});
