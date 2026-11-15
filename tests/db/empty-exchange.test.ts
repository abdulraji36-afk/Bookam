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

// Empties the supplier takes are recorded on their own sheet, as in Bilikis.
describe("empty exchanges", () => {
  let db: Db;
  let owner: string;
  let staff: string;
  let depot: { id: string };
  let empties: string;

  const exchange = (user: string, quantity: number, reference: string | null, crates: number | null = null) =>
    call(
      db,
      user,
      `select * from public.record_empty_exchange($1, $2, public_today(), $3, $4, $5, 'NBC', $6, 'Musa', null)`,
      [depot.id, null, empties, quantity, crates, reference]
    );
  const exchangeHere = async (user: string, quantity: number, reference: string | null, crates: number | null = null) =>
    (
      (await call(
        db,
        user,
        `select * from public.record_empty_exchange($1, $2, public_today(), $3, $4, $5, 'NBC', $6, 'Musa', null)`,
        [depot.id, await mainLocation(db, depot.id), empties, quantity, crates, reference]
      )) as { id: string; exchange_no: string }[]
    )[0];

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
    await adjust(db, owner, depot.id, { returnableId: empties, direction: "add", quantity: 300, reason: "opening_count" });
  });

  it("needs the supplier's reference for drinks, and a location", async () => {
    await expect(exchangeHere(staff, 100, "  ")).rejects.toThrow(/Enter the supplier's delivery reference/);
    await expect(exchange(staff, 100, "NBC-1")).rejects.toThrow();
  });

  it("takes only the empties given off the store count; the crates delivered are for the record", async () => {
    const saved = await exchangeHere(staff, 250, "NBC-7781", 500);
    expect(saved.exchange_no).toMatch(/^EXC-/);
    expect(await returnableTotals(db, depot.id, "Empties")).toEqual({ holding: 50, owed: 0 });
    const row = await db.query<{ crates: string; taken: string; reference: string }>(
      `select trim_scale(crates_delivered)::text as crates, trim_scale(quantity_taken)::text as taken, reference
       from public.supplier_exchanges where id = $1`,
      [saved.id]
    );
    expect(row.rows[0]).toEqual({ crates: "500", taken: "250", reference: "NBC-7781" });
  });

  it("cannot take more than is in store, nor part of a crate", async () => {
    await expect(exchangeHere(staff, 51, "NBC-7782")).rejects.toThrow(/You only have 50 Empties in store here, so 51 cannot be taken/);
    await expect(exchangeHere(staff, 10, "NBC-7783", 2.5)).rejects.toThrow(/whole number/);
    expect(await returnableTotals(db, depot.id, "Empties")).toEqual({ holding: 50, owed: 0 });
  });
});
