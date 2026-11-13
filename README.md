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
| `npm test` | Database tests: tenant isolation, roles, invitations, plan limits, stock, orders, dispatch, returns, voids and reports |

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
7. Returnables are a ledger too. `returnable_movements` holds two running
   counts per item: what is in store and what each customer owes. A customer
   balance below zero means the business is holding some for them.
8. Mistakes are undone, not edited. A void (owners and admins only, with a
   reason) reverses a record's effect on stock and returnables, keeps the
   record marked as voided, and writes what it was to the audit log.
9. Money the staff should not see (buying cost) lives in its own table that
   only owners and admins can read.

## Telegram notifications

One bot serves every business; each business links its own group from its
Settings page. To switch the feature on for a deployment:

1. In Telegram, message `@BotFather`, send `/newbot` and follow the steps. It
   gives you a bot username and a token.
2. Set these environment variables on the host and redeploy:
   - `TELEGRAM_BOT_TOKEN`: the token from BotFather (keep it secret)
   - `TELEGRAM_BOT_USERNAME`: the bot's username, without the `@`
   - `TELEGRAM_WEBHOOK_SECRET`: any long random string you make up
3. Tell Telegram where to send messages, once, by opening this address in a
   browser with your own values filled in:
   `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<APP ADDRESS>/api/telegram/webhook&secret_token=<WEBHOOK SECRET>`

Messages are sent after an action has finished, so a slow or unreachable
Telegram never delays or fails the action. A message that fails to send is
logged and not retried.

## Releasing a change that includes a migration

Run the new file from `supabase/migrations` against the hosted database
before the new app code goes live (`npx supabase db push`, or paste it into
the Supabase SQL editor). Migrations are written to work with the previous
version of the app, so the database can always go first.

## Roadmap

| # | Increment | Status |
| --- | --- | --- |
| 0 | Project setup | Done |
| 1 | Businesses, sign-up, team invites, roles, plan limits, data separation | Done |
| 2 | Products (with the per-product return choice), customers, receiving stock, stock levels | Done |
| 3 | Orders (stock set aside on save) and dispatch trips with a loading list | Done |
| 4 | Returns: trip returns, customer balances, supplier exchange, add/subtract adjustments | Done |
| 5 | Voids and corrections with reasons, activity log screen, daily report | Done |
| 6a | Telegram notifications, linked per business | Done |
| 6b | Billing for the plans, and what happens when a trial ends | Next |
