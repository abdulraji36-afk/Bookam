import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

// The minimum of Supabase's environment that our migrations rely on:
// the three API roles, the auth schema, auth.users and auth.uid().
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  -- Test convenience: today's date in Lagos, callable by any role.
  create function public_today() returns date language sql stable as $$
    select (now() at time zone 'Africa/Lagos')::date;
  $$;
`;

export type Db = PGlite;

export async function createTestDb(): Promise<Db> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }

  return db;
}

/** Creates an auth user the way Supabase Auth would; the profile trigger runs. */
export async function createUser(db: Db, email: string, fullName = "Test User") {
  const result = await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data)
     values ($1, jsonb_build_object('full_name', $2::text))
     returning id`,
    [email, fullName]
  );
  return result.rows[0].id;
}

type Row = Record<string, unknown>;

export type Session = {
  query: <T extends Row = Row>(sql: string, params?: unknown[]) => Promise<T[]>;
};

/**
 * Runs the callback as a signed-in user (or as an anonymous visitor when
 * userId is null), with the same role switch PostgREST performs.
 */
export async function as<T>(
  db: Db,
  userId: string | null,
  run: (session: Session) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ""]);
    await tx.exec(`set local role ${userId ? "authenticated" : "anon"}`);

    return run({
      query: async <R extends Row = Row>(sql: string, params: unknown[] = []) =>
        (await tx.query<R>(sql, params)).rows
    });
  });
}

export async function createBusiness(db: Db, ownerId: string, name: string) {
  const rows = await as(db, ownerId, (s) =>
    s.query<{ id: string; slug: string }>(`select * from public.create_organization($1)`, [name])
  );
  return rows[0];
}

export async function setPlan(db: Db, organizationId: string, planCode: string) {
  await db.query(`update public.organizations set plan_code = $1 where id = $2`, [
    planCode,
    organizationId
  ]);
}

export async function invite(
  db: Db,
  inviterId: string,
  organizationId: string,
  email: string,
  role: "admin" | "staff" = "staff"
) {
  const rows = await as(db, inviterId, (s) =>
    s.query<{ invitation_id: string; token: string }>(
      `select * from public.invite_member($1, $2, $3)`,
      [organizationId, email, role]
    )
  );
  return rows[0];
}

export async function accept(db: Db, userId: string, token: string) {
  const rows = await as(db, userId, (s) =>
    s.query<{ organization_id: string; slug: string }>(
      `select * from public.accept_invitation($1)`,
      [token]
    )
  );
  return rows[0];
}

/** Invites an existing user by their email and accepts on their behalf. */
export async function addMember(
  db: Db,
  inviterId: string,
  organizationId: string,
  user: { id: string; email: string },
  role: "admin" | "staff" = "staff"
) {
  const { token } = await invite(db, inviterId, organizationId, user.email, role);
  await accept(db, user.id, token);
  const result = await db.query<{ id: string }>(
    `select id from public.memberships where organization_id = $1 and user_id = $2`,
    [organizationId, user.id]
  );
  return result.rows[0].id;
}

type ProductInput = {
  id?: string | null;
  name: string;
  sku?: string | null;
  unit?: string;
  sellingPrice?: number | null;
  costPrice?: number | null;
  lowStock?: number | null;
  returnItem?: string | null;
};

export async function saveProduct(db: Db, userId: string, organizationId: string, input: ProductInput) {
  const rows = await as(db, userId, (s) =>
    s.query<{ id: string }>(
      `select public.save_product($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as id`,
      [
        organizationId,
        input.id ?? null,
        input.name,
        input.sku ?? null,
        input.unit ?? "crate",
        input.sellingPrice ?? null,
        input.costPrice ?? null,
        input.lowStock ?? null,
        Boolean(input.returnItem),
        input.returnItem ?? null
      ]
    )
  );
  return rows[0].id;
}

export async function saveCustomer(
  db: Db,
  userId: string,
  organizationId: string,
  input: { id?: string | null; name: string; phone?: string; area?: string; address?: string }
) {
  const rows = await as(db, userId, (s) =>
    s.query<{ id: string }>(`select public.save_customer($1, $2, $3, $4, $5, $6) as id`, [
      organizationId,
      input.id ?? null,
      input.name,
      input.phone ?? null,
      input.area ?? null,
      input.address ?? null
    ])
  );
  return rows[0].id;
}

export async function mainLocation(db: Db, organizationId: string) {
  const result = await db.query<{ id: string }>(
    `select id from public.locations where organization_id = $1 and is_default`,
    [organizationId]
  );
  return result.rows[0].id;
}

export async function receiveStock(
  db: Db,
  userId: string,
  organizationId: string,
  items: { product_id: string; quantity: number }[],
  options: { locationId?: string; date?: string } = {}
) {
  const locationId = options.locationId ?? (await mainLocation(db, organizationId));
  const rows = await as(db, userId, (s) =>
    s.query<{ id: string; receipt_no: string }>(
      `select * from public.record_stock_receipt($1, $2, coalesce($3::date, public_today()), 'Supplier', 'REF-1', null, $4::jsonb)`,
      [organizationId, locationId, options.date ?? null, JSON.stringify(items)]
    )
  );
  return rows[0];
}
