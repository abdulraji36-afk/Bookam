import { beforeAll, describe, expect, it } from "vitest";
import {
  accept,
  addMember,
  as,
  createBusiness,
  createTestDb,
  createUser,
  invite,
  receiveStock,
  saveCustomer,
  saveProduct,
  setPlan,
  type Db
} from "./harness";

const TENANT_TABLES = [
  "organizations",
  "locations",
  "memberships",
  "invitations",
  "audit_logs",
  "returnable_items",
  "products",
  "product_costs",
  "customers",
  "stock_receipts",
  "stock_receipt_items",
  "stock_movements",
  "product_stock_levels",
  "product_stock_totals"
];

describe("tenant isolation", () => {
  let db: Db;
  let ada: string; // owner of Ada Drinks
  let bola: string; // owner of Bola Gas
  let adaOrg: { id: string; slug: string };
  let bolaOrg: { id: string; slug: string };

  beforeAll(async () => {
    db = await createTestDb();
    ada = await createUser(db, "ada@example.com", "Ada");
    bola = await createUser(db, "bola@example.com", "Bola");
    adaOrg = await createBusiness(db, ada, "Ada Drinks");
    bolaOrg = await createBusiness(db, bola, "Bola Gas");
    await invite(db, ada, adaOrg.id, "pending@example.com");
    await invite(db, bola, bolaOrg.id, "pending@example.com");

    // Give both businesses a row in every business-owned table.
    for (const [owner, org] of [
      [ada, adaOrg],
      [bola, bolaOrg]
    ] as const) {
      const product = await saveProduct(db, owner, org.id, {
        name: "Cola 50cl",
        costPrice: 3000,
        returnItem: "Empty crate"
      });
      await saveCustomer(db, owner, org.id, { name: "Mama Tunde Stores" });
      await receiveStock(db, owner, org.id, [{ product_id: product, quantity: 10 }]);
    }
  });

  it("gives a new business a slug, a default location, an owner and a trial", async () => {
    expect(adaOrg.slug).toBe("ada-drinks");

    const rows = await as(db, ada, (s) =>
      s.query(
        `select o.plan_code, o.trial_ends_at > now() as on_trial, o.currency_code, o.timezone,
                (select count(*)::int from public.locations l where l.is_default) as default_locations,
                (select role::text from public.memberships m where m.user_id = $1) as role
         from public.organizations o`,
        [ada]
      )
    );

    expect(rows).toEqual([
      {
        plan_code: "trial",
        on_trial: true,
        currency_code: "NGN",
        timezone: "Africa/Lagos",
        default_locations: 1,
        role: "owner"
      }
    ]);
  });

  it("makes slugs unique when two businesses share a name", async () => {
    const second = await createBusiness(db, bola, "Ada Drinks");
    expect(second.slug).toBe("ada-drinks-2");
    // Clean up so later counts stay simple.
    await db.query(`delete from public.organizations where id = $1`, [second.id]);
  });

  it.each(TENANT_TABLES)("only returns the caller's own rows from %s", async (table) => {
    const idColumn = table === "organizations" ? "id" : "organization_id";

    const adaSees = await as(db, ada, (s) =>
      s.query<{ org: string }>(`select distinct ${idColumn} as org from public.${table}`)
    );
    const bolaSees = await as(db, bola, (s) =>
      s.query<{ org: string }>(`select distinct ${idColumn} as org from public.${table}`)
    );

    expect(adaSees.map((row) => row.org)).toEqual([adaOrg.id]);
    expect(bolaSees.map((row) => row.org)).toEqual([bolaOrg.id]);
  });

  it.each(TENANT_TABLES)("shows nothing from %s to a visitor who is not signed in", async (table) => {
    await expect(as(db, null, (s) => s.query(`select 1 from public.${table}`))).rejects.toThrow(
      /permission denied/
    );
  });

  it("hides other businesses' people", async () => {
    const profiles = await as(db, ada, (s) => s.query<{ email: string }>(`select email from public.profiles`));
    expect(profiles.map((row) => row.email)).toEqual(["ada@example.com"]);
  });

  it.each(TENANT_TABLES)("rejects direct writes to %s", async (table) => {
    // The stock view is a summary and cannot be written to by anyone.
    await expect(
      as(db, ada, (s) => s.query(`delete from public.${table}`))
    ).rejects.toThrow(/permission denied|cannot delete from view/);
  });

  it("does not let a user edit their own email on their profile", async () => {
    await expect(
      as(db, ada, (s) => s.query(`update public.profiles set email = 'bola@example.com'`))
    ).rejects.toThrow(/permission denied/);

    await as(db, ada, (s) => s.query(`update public.profiles set full_name = 'Ada O.'`));
    const names = await db.query<{ full_name: string }>(
      `select full_name from public.profiles order by email`
    );
    expect(names.rows.map((row) => row.full_name)).toEqual(["Ada O.", "Bola"]);
  });

  it("blocks an owner from acting on another business", async () => {
    await expect(invite(db, ada, bolaOrg.id, "spy@example.com")).rejects.toThrow(
      /do not have permission/
    );
    await expect(
      as(db, ada, (s) => s.query(`select public.update_organization($1, 'Hacked')`, [bolaOrg.id]))
    ).rejects.toThrow(/do not have permission/);
    await expect(
      as(db, ada, (s) => s.query(`select public.create_location($1, 'Annex')`, [bolaOrg.id]))
    ).rejects.toThrow(/do not have permission/);

    const bolaInvite = await db.query<{ id: string }>(
      `select id from public.invitations where organization_id = $1`,
      [bolaOrg.id]
    );
    await expect(
      as(db, ada, (s) => s.query(`select public.revoke_invitation($1)`, [bolaInvite.rows[0].id]))
    ).rejects.toThrow(/do not have permission/);

    const bolaMembership = await db.query<{ id: string }>(
      `select id from public.memberships where organization_id = $1`,
      [bolaOrg.id]
    );
    await expect(
      as(db, ada, (s) =>
        s.query(`select public.set_member_active($1, false)`, [bolaMembership.rows[0].id])
      )
    ).rejects.toThrow(/do not have permission/);
  });

  it("requires a signed-in user to create a business", async () => {
    await expect(
      as(db, null, (s) => s.query(`select * from public.create_organization('Ghost')`))
    ).rejects.toThrow(/permission denied/);
  });
});

describe("invitations", () => {
  let db: Db;
  let owner: string;
  let org: { id: string; slug: string };

  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db, "owner@example.com", "Owner");
    org = await createBusiness(db, owner, "Depot One");
  });

  it("lets an invited person join with the right role, once", async () => {
    const chidi = await createUser(db, "chidi@example.com", "Chidi");
    const { token } = await invite(db, owner, org.id, "Chidi@Example.com ", "staff");

    const preview = await as(db, null, (s) =>
      s.query(`select * from public.get_invitation_preview($1)`, [token])
    );
    expect(preview).toEqual([
      { organization_name: "Depot One", email: "chidi@example.com", role: "staff", status: "pending" }
    ]);

    const joined = await accept(db, chidi, token);
    expect(joined).toEqual({ organization_id: org.id, slug: "depot-one" });

    const team = await as(db, chidi, (s) =>
      s.query<{ email: string; role: string }>(
        `select p.email, m.role::text as role
         from public.memberships m join public.profiles p on p.id = m.user_id
         order by p.email`
      )
    );
    expect(team).toEqual([
      { email: "chidi@example.com", role: "staff" },
      { email: "owner@example.com", role: "owner" }
    ]);

    await expect(accept(db, chidi, token)).rejects.toThrow(/already been used/);
  });

  it("stores only a hash of the invite token", async () => {
    const { token } = await invite(db, owner, org.id, "hash-check@example.com");
    const stored = await db.query<{ token_hash: string }>(
      `select token_hash from public.invitations where email = 'hash-check@example.com'`
    );
    expect(token).toHaveLength(64);
    expect(stored.rows[0].token_hash).not.toBe(token);
  });

  it("refuses a token used by someone with a different email", async () => {
    const stranger = await createUser(db, "stranger@example.com");
    const { token } = await invite(db, owner, org.id, "intended@example.com");
    await expect(accept(db, stranger, token)).rejects.toThrow(/different email address/);
  });

  it("refuses unknown, revoked and expired tokens", async () => {
    const dayo = await createUser(db, "dayo@example.com");
    await expect(accept(db, dayo, "not-a-real-token")).rejects.toThrow(/not valid/);

    const revoked = await invite(db, owner, org.id, "dayo@example.com");
    await as(db, owner, (s) => s.query(`select public.revoke_invitation($1)`, [revoked.invitation_id]));
    await expect(accept(db, dayo, revoked.token)).rejects.toThrow(/cancelled/);

    const expired = await invite(db, owner, org.id, "dayo@example.com");
    await db.query(`update public.invitations set expires_at = now() - interval '1 minute' where id = $1`, [
      expired.invitation_id
    ]);
    await expect(accept(db, dayo, expired.token)).rejects.toThrow(/expired/);
  });

  it("replaces the earlier link when the same person is invited again", async () => {
    const emeka = await createUser(db, "emeka@example.com");
    const first = await invite(db, owner, org.id, "emeka@example.com");
    const second = await invite(db, owner, org.id, "emeka@example.com");

    await expect(accept(db, emeka, first.token)).rejects.toThrow(/cancelled/);
    await expect(accept(db, emeka, second.token)).resolves.toMatchObject({ slug: "depot-one" });
  });

  it("refuses to invite someone already on the team, or as owner", async () => {
    await expect(invite(db, owner, org.id, "owner@example.com")).rejects.toThrow(/already on your team/);
    await expect(
      as(db, owner, (s) => s.query(`select * from public.invite_member($1, 'x@example.com', 'owner')`, [org.id]))
    ).rejects.toThrow(/Admin or Staff/);
    await expect(invite(db, owner, org.id, "not-an-email")).rejects.toThrow(/valid email/);
  });
});

describe("roles", () => {
  let db: Db;
  let owner: string;
  let admin: string;
  let staff: string;
  let org: { id: string; slug: string };
  let adminMembership: string;
  let staffMembership: string;

  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db, "owner@example.com");
    admin = await createUser(db, "admin@example.com");
    staff = await createUser(db, "staff@example.com");
    org = await createBusiness(db, owner, "Role Test");
    adminMembership = await addMember(db, owner, org.id, { id: admin, email: "admin@example.com" }, "admin");
    staffMembership = await addMember(db, owner, org.id, { id: staff, email: "staff@example.com" }, "staff");
  });

  it("keeps staff out of invitations, the audit log and team changes", async () => {
    const visible = await as(db, staff, (s) =>
      s.query<{ invitations: number; audit: number }>(
        `select (select count(*)::int from public.invitations) as invitations,
                (select count(*)::int from public.audit_logs) as audit`
      )
    );
    expect(visible).toEqual([{ invitations: 0, audit: 0 }]);

    await expect(invite(db, staff, org.id, "friend@example.com")).rejects.toThrow(/do not have permission/);
    await expect(
      as(db, staff, (s) => s.query(`select public.set_member_active($1, false)`, [adminMembership]))
    ).rejects.toThrow(/do not have permission/);
    await expect(
      as(db, staff, (s) => s.query(`select public.update_organization($1, 'Mine now')`, [org.id]))
    ).rejects.toThrow(/do not have permission/);
  });

  it("lets an admin invite staff but not admins, and not change roles", async () => {
    await expect(invite(db, admin, org.id, "new-staff@example.com", "staff")).resolves.toBeTruthy();
    await expect(invite(db, admin, org.id, "new-admin@example.com", "admin")).rejects.toThrow(
      /Only the owner can invite an admin/
    );
    await expect(
      as(db, admin, (s) => s.query(`select public.set_member_role($1, 'admin')`, [staffMembership]))
    ).rejects.toThrow(/do not have permission/);
  });

  it("protects the owner and stops people changing their own access", async () => {
    const ownerMembership = (
      await db.query<{ id: string }>(`select id from public.memberships where user_id = $1`, [owner])
    ).rows[0].id;

    await expect(
      as(db, admin, (s) => s.query(`select public.set_member_active($1, false)`, [ownerMembership]))
    ).rejects.toThrow(/owner cannot be removed/);
    await expect(
      as(db, owner, (s) => s.query(`select public.set_member_role($1, 'staff')`, [ownerMembership]))
    ).rejects.toThrow(/owner role cannot be changed/);
    await expect(
      as(db, admin, (s) => s.query(`select public.set_member_active($1, false)`, [adminMembership]))
    ).rejects.toThrow(/own access/);
  });

  it("cuts off a deactivated member immediately and restores them on reactivation", async () => {
    await as(db, owner, (s) => s.query(`select public.set_member_active($1, false)`, [staffMembership]));

    const afterRemoval = await as(db, staff, (s) => s.query(`select id from public.organizations`));
    expect(afterRemoval).toEqual([]);

    await as(db, owner, (s) => s.query(`select public.set_member_active($1, true)`, [staffMembership]));
    const afterReturn = await as(db, staff, (s) => s.query(`select id from public.organizations`));
    expect(afterReturn).toHaveLength(1);
  });

  it("lets the owner promote and demote, and records it in the audit log", async () => {
    await as(db, owner, (s) => s.query(`select public.set_member_role($1, 'admin')`, [staffMembership]));
    await as(db, owner, (s) => s.query(`select public.set_member_role($1, 'staff')`, [staffMembership]));

    const audit = await as(db, owner, (s) =>
      s.query<{ action: string; user_id: string }>(
        `select action, user_id from public.audit_logs where action = 'set_member_role'`
      )
    );
    expect(audit).toEqual([
      { action: "set_member_role", user_id: owner },
      { action: "set_member_role", user_id: owner }
    ]);
  });
});

describe("plan limits", () => {
  let db: Db;
  let owner: string;
  let org: { id: string; slug: string };

  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db, "owner@example.com");
    org = await createBusiness(db, owner, "Small Shop");
    await setPlan(db, org.id, "starter"); // 3 team members, 1 location
  });

  it("counts open invitations as seats and stops at the plan's limit", async () => {
    const second = await createUser(db, "second@example.com");
    await addMember(db, owner, org.id, { id: second, email: "second@example.com" });
    await invite(db, owner, org.id, "third@example.com");

    await expect(invite(db, owner, org.id, "fourth@example.com")).rejects.toThrow(
      /up to 3 team members/
    );

    // Re-sending to the same address does not need a new seat.
    await expect(invite(db, owner, org.id, "third@example.com")).resolves.toBeTruthy();
  });

  it("frees the seat when an invitation is cancelled", async () => {
    const open = await db.query<{ id: string }>(
      `select id from public.invitations
       where email = 'third@example.com' and revoked_at is null`
    );
    await as(db, owner, (s) => s.query(`select public.revoke_invitation($1)`, [open.rows[0].id]));
    await expect(invite(db, owner, org.id, "fourth@example.com")).resolves.toBeTruthy();
  });

  it("stops a reactivation that would exceed the limit", async () => {
    const second = (
      await db.query<{ id: string }>(
        `select m.id from public.memberships m join public.profiles p on p.id = m.user_id
         where p.email = 'second@example.com'`
      )
    ).rows[0].id;

    await as(db, owner, (s) => s.query(`select public.set_member_active($1, false)`, [second]));
    await invite(db, owner, org.id, "fifth@example.com"); // takes the freed seat

    await expect(
      as(db, owner, (s) => s.query(`select public.set_member_active($1, true)`, [second]))
    ).rejects.toThrow(/up to 3 team members/);
  });

  it("limits locations by plan and lifts the limit on a bigger plan", async () => {
    const addLocation = (name: string) =>
      as(db, owner, (s) => s.query(`select public.create_location($1, $2)`, [org.id, name]));

    await expect(addLocation("Second Store")).rejects.toThrow(/up to 1 location/);

    await setPlan(db, org.id, "growth"); // 2 locations
    await addLocation("Second Store");
    await expect(addLocation("Third Store")).rejects.toThrow(/up to 2 location/);

    await setPlan(db, org.id, "business"); // unlimited
    await addLocation("Third Store");
    await expect(addLocation(" second store ")).rejects.toThrow(/already exists/);
  });
});
