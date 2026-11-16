import { beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  adjust,
  call,
  createTestDb,
  createUser,
  mainLocation,
  returnableId,
  returnableTotals,
  type Db
} from "./harness";

// Bilikis's Empty Balance page: set the opening empties, correct an adjustment.
describe("empty balance", () => {
  let db: Db;
  let owner: string;
  let staff: string;
  let depot: { id: string };
  let empties: string;
  let location: string;

  const setOpening = (user: string, quantity: number, date = "public_today()") =>
    call(db, user, `select public.set_opening_empties($1, $2, $3, $4, ${date}) as id`, [
      depot.id,
      location,
      empties,
      quantity
    ]) as Promise<{ id: string }[]>;
  const correct = (user: string, id: string, quantity: number, reason = "Counted the stack again") =>
    call(db, user, `select public.correct_returnable_adjustment($1, $2, $3)`, [id, quantity, reason]);
  const openings = async () =>
    (
      await db.query<{ quantity: string; date: string }>(
        `select trim_scale(quantity_delta)::text as quantity, adjustment_date::text as date
         from public.returnable_adjustments
         where organization_id = $1 and reason = 'opening_count' and voided_at is null`,
        [depot.id]
      )
    ).rows;

  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db, "owner@example.com");
    staff = await createUser(db, "staff@example.com");
    depot = (
      (await call(db, owner, `select * from public.create_organization('Depot', null, false, false, 'quantity', true, true)`)) as {
        id: string;
      }[]
    )[0];
    await addMember(db, owner, depot.id, { id: staff, email: "staff@example.com" }, "staff");
    empties = await returnableId(db, depot.id, "Empties");
    location = await mainLocation(db, depot.id);
  });

  it("sets the opening empties once, and setting them again changes that one record", async () => {
    await expect(setOpening(staff, 500)).rejects.toThrow(/permission|owner|admin/i);
    const first = (await setOpening(owner, 500))[0].id;
    expect(await returnableTotals(db, depot.id, "Empties")).toEqual({ holding: 500, owed: 0 });
    const again = (await setOpening(owner, 450, "public_today() - 1"))[0].id;
    expect(again).toBe(first);
    expect(await openings()).toHaveLength(1);
    expect((await openings())[0].quantity).toBe("450");
    expect(await returnableTotals(db, depot.id, "Empties")).toEqual({ holding: 450, owed: 0 });
    // The ledger line moved to the new date with it.
    const moved = await db.query<{ same: boolean }>(
      `select m.movement_date = a.adjustment_date as same
       from public.returnable_movements m join public.returnable_adjustments a on a.id = m.source_id
       where a.id = $1`,
      [first]
    );
    expect(moved.rows[0].same).toBe(true);
  });

  it("corrects an adjustment in place, keeping its direction, with a reason and an audit entry", async () => {
    await adjust(db, owner, depot.id, { returnableId: empties, direction: "subtract", quantity: 20, reason: "damaged_or_lost" });
    const id = (
      await db.query<{ id: string }>(
        `select id from public.returnable_adjustments where organization_id = $1 and reason = 'damaged_or_lost'`,
        [depot.id]
      )
    ).rows[0].id;
    expect(await returnableTotals(db, depot.id, "Empties")).toEqual({ holding: 430, owed: 0 });
    await expect(correct(staff, id, 15)).rejects.toThrow(/permission|owner|admin/i);
    await expect(correct(owner, id, 15, "short")).rejects.toThrow(/reason/i);
    await expect(correct(owner, id, 20)).rejects.toThrow(/already the quantity/);
    await expect(correct(owner, id, 2.5)).rejects.toThrow(/whole numbers/);
    await correct(owner, id, 15);
    expect(await returnableTotals(db, depot.id, "Empties")).toEqual({ holding: 435, owed: 0 });
    const audit = await db.query<{ old: string; new: string }>(
      `select old_values->>'quantity_delta' as old, new_values->>'quantity_delta' as new
       from public.audit_logs where action = 'correct_returnable_adjustment' and entity_id = $1`,
      [id]
    );
    expect(audit.rows[0]).toEqual({ old: "-20", new: "-15" });
  });

  it("never takes more out of store than is there, and a voided adjustment cannot be corrected", async () => {
    const opening = (await setOpening(owner, 450))[0].id;
    await expect(correct(owner, opening, 1)).rejects.toThrow(/takes 449 out of store, but only 435 are there now/);
    await adjust(db, owner, depot.id, { returnableId: empties, direction: "add", quantity: 5, reason: "purchase" });
    const purchase = (
      await db.query<{ id: string }>(
        `select id from public.returnable_adjustments where organization_id = $1 and reason = 'purchase'`,
        [depot.id]
      )
    ).rows[0].id;
    await call(db, owner, `select public.void_returnable_adjustment($1, 'Entered by mistake today')`, [purchase]);
    await expect(correct(owner, purchase, 6)).rejects.toThrow(/was voided/);
  });
});
