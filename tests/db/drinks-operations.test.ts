import { beforeAll, describe, expect, it } from "vitest";
import { addMember, call, createOrder, createTestDb, createUser, saveCustomer, saveProduct, receiveStock, mainLocation, type Db } from "./harness";

describe("running a drinks depot", () => {
  let db: Db;
  let owner: string;
  let staff: string;
  let depot: { id: string };

  const category = async (productId: string) =>
    (await db.query<{ category: string | null }>(`select category from public.products where id = $1`, [productId])).rows[0]
      .category;
  const worker = (user: string, name: string, role: string, id: string | null = null) =>
    call(db, user, `select public.save_dispatch_worker($1, $2, $3, $4, '0803 000 0000') as id`, [depot.id, id, name, role]).then(
      (rows) => (rows[0] as { id: string }).id
    );

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
  });

  it("drinks have a category; an RGB drink is always RGB", async () => {
    const rgb = await call(
      db,
      owner,
      `select public.save_product($1, null, 'Coke 50cl RGB', null, 'crate', 4200, 3900, null, true, 'Empties', false, null, 'PET') as id`,
      [depot.id]
    );
    expect(await category((rgb[0] as { id: string }).id)).toBe("RGB");
    const juice = await call(
      db,
      owner,
      `select public.save_product($1, null, '5Alive 30cl', null, 'pack', 5000, 4500, null, false, null, false, null, 'Juice') as id`,
      [depot.id]
    );
    expect(await category((juice[0] as { id: string }).id)).toBe("Juice");
    // The older twelve-argument call still works and leaves no category.
    const plain = await saveProduct(db, owner, depot.id, { name: "Eva Water", unit: "pack", sellingPrice: 2000, costPrice: 1800 });
    expect(await category(plain)).toBeNull();
  });

  it("owners keep a list of drivers and loaders; staff cannot change it", async () => {
    const musa = await worker(owner, "Musa", "driver");
    await worker(owner, "Sule", "loader");
    await expect(worker(owner, "musa", "driver")).rejects.toThrow(/You already have a driver called musa/);
    // The same name can be both a driver and a loader.
    await expect(worker(owner, "Musa", "loader")).resolves.toBeTruthy();
    await expect(worker(staff, "Bayo", "loader")).rejects.toThrow(/do not have permission/);
    await expect(worker(owner, "Bayo", "manager")).rejects.toThrow(/driver or a worker/);
    await worker(owner, "Musa Ade", "driver", musa);
    const names = await db.query<{ name: string }>(
      `select name from public.dispatch_workers where organization_id = $1 and role = 'driver'`,
      [depot.id]
    );
    expect(names.rows.map((row) => row.name)).toEqual(["Musa Ade"]);
  });

  const crewTrip = async (user: string, driverId: string, orderIds: string[], workerIds: string[]) =>
    (
      (await call(
        db,
        user,
        `select * from public.create_dispatch_trip_with_crew($1, $2, public_today(), $3, null, $4::uuid[], $5::uuid[])`,
        [depot.id, await mainLocation(db, depot.id), driverId, orderIds, workerIds]
      )) as { id: string; trip_no: string }[]
    )[0];
  const people = async (role: "driver" | "loader") =>
    (
      await db.query<{ id: string }>(
        `select id from public.dispatch_workers where organization_id = $1 and role = $2 and is_active order by name`,
        [depot.id, role]
      )
    ).rows.map((row) => row.id);
  const waitingOrder = async (name: string) => {
    const product = await saveProduct(db, owner, depot.id, { name: `${name} PET`, unit: "pack", sellingPrice: 3000, costPrice: 2700 });
    await receiveStock(db, owner, depot.id, [{ product_id: product, quantity: 20 }]);
    const customer = await saveCustomer(db, owner, depot.id, { name });
    return createOrder(db, staff, depot.id, customer, [{ product_id: product, quantity: 2 }]);
  };

  it("a trip takes its driver and one or more workers from the list, and no truck", async () => {
    const order = await waitingOrder("Mama Tunde");
    const [driver] = await people("driver");
    const workers = await people("loader");
    const trip = await crewTrip(staff, driver, [order.id], workers);
    expect(trip.trip_no).toMatch(/^TRP-/);
    const saved = await db.query<{ driver_name: string; driver_id: string; vehicle: string | null }>(
      `select driver_name, driver_id, vehicle from public.dispatch_trips where id = $1`,
      [trip.id]
    );
    expect(saved.rows[0]).toEqual({ driver_name: "Musa Ade", driver_id: driver, vehicle: null });
    const crew = async () =>
      (await db.query(`select worker_id from public.dispatch_trip_loaders where trip_id = $1`, [trip.id])).rows.length;
    expect(await crew()).toBe(workers.length);

    // Workers can be changed until it leaves, but never down to nobody.
    await expect(call(db, staff, `select public.set_trip_loaders($1, $2::uuid[])`, [trip.id, [driver]])).rejects.toThrow(
      /Choose workers from your list/
    );
    await expect(call(db, staff, `select public.set_trip_loaders($1, '{}'::uuid[])`, [trip.id])).rejects.toThrow(
      /at least one worker/
    );
    await call(db, staff, `select public.set_trip_loaders($1, $2::uuid[])`, [trip.id, [workers[0]]]);
    expect(await crew()).toBe(1);
    await call(db, staff, `select public.dispatch_trip($1)`, [trip.id]);
    await expect(call(db, staff, `select public.set_trip_loaders($1, $2::uuid[])`, [trip.id, [workers[0]]])).rejects.toThrow(
      /before the trip is dispatched/
    );
  });

  it("refuses a trip without a listed driver or without workers; nothing is saved", async () => {
    const order = await waitingOrder("Grace Canteen");
    const [driver] = await people("driver");
    const workers = await people("loader");
    await expect(crewTrip(owner, workers[0], [order.id], workers)).rejects.toThrow(/Choose the driver from your list/);
    await expect(crewTrip(owner, driver, [order.id], [])).rejects.toThrow(/at least one worker/);

    const old = await worker(owner, "Old Worker", "loader");
    await call(db, owner, `select public.set_dispatch_worker_active($1, false)`, [old]);
    await expect(crewTrip(owner, driver, [order.id], [old])).rejects.toThrow(/Choose workers from your list/);

    const status = await db.query<{ status: string }>(`select status from public.orders where id = $1`, [order.id]);
    expect(status.rows[0].status).toBe("pending");

    // Trips cannot be made the old way, with a typed driver name.
    await expect(
      call(db, owner, `select * from public.create_dispatch_trip($1, $2, public_today(), 'Anyone', null, null, $3::uuid[])`, [
        depot.id,
        await mainLocation(db, depot.id),
        [order.id]
      ])
    ).rejects.toThrow(/permission denied/);
  });
});
