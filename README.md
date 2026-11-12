# Bookam

Order and dispatch software for depots, shops and warehouses. Each business
decides, product by product, whether customers must bring something back
(crates, cylinders, pallets) or whether a dispatch simply completes the sale.

Bookam is a multi-business rebuild of the single-shop Bilikis Store app.

## Stack

- Next.js (App Router), TypeScript, Tailwind CSS
- Supabase: Postgres, Auth and row level security
- Zod for input validation, Vitest + PGlite for database tests

## Getting started

Requires Node 22+ and Docker (for the local Supabase stack).

```bash
npm install
npx supabase start          # local Postgres + Auth, applies supabase/migrations
cp .env.example .env.local  # then paste the API URL and publishable key printed above
npm run dev
```

Open http://localhost:3000. Confirmation emails sent by the local stack appear
in Mailpit at http://127.0.0.1:54324.

### Using a hosted Supabase project

1. Create a project, then run `npx supabase link` and `npx supabase db push`.
2. Put the project URL and publishable key in `.env.local` (and in your host's
   environment variables), and set `NEXT_PUBLIC_SITE_URL` to the app's address.
3. In Supabase, under Authentication → URL Configuration, set the Site URL to
   the app's address and add `<app address>/**` to the redirect URLs. Without
   this, email confirmation links will not return to the app.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app in development |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate route types and run the TypeScript compiler |
| `npm test` | Database tests: tenant isolation, roles, invitations, plan limits, stock, orders and dispatch |

## How the code is organised

```
src/app/                 Pages. /b/[slug]/... is everything inside one business
src/app/actions/         Server actions (the only way the UI changes data)
src/lib/org.ts           requireOrg(): loads the business and checks membership
src/lib/supabase/        Supabase clients for server code and the proxy
supabase/migrations/     The database: tables, security rules, write functions
tests/db/                Tests that run the real migrations in an in-memory Postgres
```

## Rules every new feature follows

These are what keep one business's data away from another's.

1. Every table that belongs to a business has an `organization_id` column.
2. Clients may only `select`, and row level security limits that to businesses
   the signed-in user is an active member of.
3. Every write goes through a `security definer` SQL function that checks the
   caller's role first and writes its audit log row in the same transaction.
4. Every new table gets a case in `tests/db/tenancy.test.ts` proving another
   business cannot read or write it.
5. Stock is a ledger. Nothing edits a stock number; every change is a row in
   `stock_movements` and the stock on hand is the sum of those rows.
6. An order copies the price and the return rule from the product when it is
   saved, so later product changes never rewrite an old order.
7. Money the staff should not see (buying cost) lives in its own table that
   only owners and admins can read.

## Roadmap

| # | Increment | Status |
| --- | --- | --- |
| 0 | Project setup | Done |
| 1 | Businesses, sign-up, team invites, roles, plan limits, data separation | Done |
| 2 | Products (with the per-product return choice), customers, receiving stock, stock levels | Done |
| 3 | Orders (stock set aside on save) and dispatch trips with a loading list | Done |
| 4 | Returns on dispatch: expected vs actual, shortages, follow-ups | Next |
| 5 | Admin corrections, voids, audit log screen, daily operations report | |
| 6 | Notifications per business, then billing | |
