# BukAm

Order and dispatch software for depots, shops and warehouses. Each business
decides, product by product, whether customers must bring something back
(crates, cylinders, pallets) or whether a dispatch simply completes the sale.

BukAm is a multi-business rebuild of the single-shop Bilikis Store app.

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
| `npm test` | Database tests: tenant isolation, roles, invitations, plan limits, stock, orders, dispatch, returns, voids, reports, serials and write-offs |
| `npm run test:e2e` | Browser walkthroughs in `tests/e2e/` against a running app (see below) |

### Browser walkthroughs

Each file in `tests/e2e/` signs up fresh users and clicks through one area of
the app in Chromium, the way a person would. To run them:

1. `npx supabase start`. Its Mailpit (port 54324) catches the sign-up and
   password-reset emails, which the walkthroughs open.
2. In `.env.local`, point the app at the local Supabase, set
   `NEXT_PUBLIC_SITE_URL=http://localhost:3000`, and for the Telegram
   walkthrough set `TELEGRAM_BOT_TOKEN=test-token`,
   `TELEGRAM_BOT_USERNAME=bookam_test_bot`, `TELEGRAM_WEBHOOK_SECRET=` any
   value and `TELEGRAM_API_BASE=http://127.0.0.1:8099`. The runner starts a
   stand-in Telegram on that port.
3. `npm run build && npm start`, then `npm run test:e2e` in another terminal.
   `npm run test:e2e -- 04 08` runs only the files starting with those numbers.
   Screenshots go to `test-results/e2e/`.

The first time on a new machine, install the browser with
`npx playwright install chromium`.

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
8. Serial-numbered units live in `product_units`. For a tracked product the
   stock ledger at a location always equals the number of its units in stock
   there; a test checks this.
9. Mistakes are undone, not edited. A void (owners and admins only, with a
   reason) reverses a record's effect on stock and returnables, keeps the
   record marked as voided, and writes what it was to the audit log.
10. Money the staff should not see (buying cost) lives in its own table that
   only owners and admins can read.
11. Stock only changes through deliveries (and their corrections) and
   orders. There are no write-offs: damaged or expired goods go out on an
   order to a customer such as "Breakages", which is then switched off.
   Write-offs recorded before this stay in the history.
12. How a business sells decides what it sees. `organizations.selling_mode`
   is `quantity` (counts its goods: depots, stores) or `serial` (sells items
   one by one by serial number: phone and laptop shops). It sets the words
   ("orders" or "sales"), the defaults and how Products and Stock are grouped;
   in serial mode each product can still be counted instead, for accessories.
   `does_delivery` shows or hides Dispatch. `tracks_returns` and
   `tracks_serials` switch those parts on. All of them come from the sign-up
   questions and can be changed in Settings. The database refuses a product that needs a switched-off
   feature, and refuses to switch one off while a product or a customer
   balance still uses it.

13. A drinks business (`organizations.sells_drinks`) works like Bilikis. It
   has one pool of empties, named "Empties" once, and every drink is RGB
   (the empty crate comes back) or PET (nothing comes back), with its selling
   price and buying cost required; RGB is sold by the crate and PET by the
   pack, and a PET drink always has a category chosen on purpose. A
   supplier delivery carries the supplier's reference. Empties the supplier
   takes are an empty exchange of their own (`record_empty_exchange`): its
   own form, list and record, with the delivery reference and the RGB
   crates delivered kept for the record. What customers owe is kept per order, never as a running balance
   (see 15).

14. A delivery can be corrected after the fact by an owner or admin
   (`correct_stock_receipt`), as in Bilikis: date, supplier, reference,
   note, and its products (add, remove, change quantities and costs). Its
   stock movements are deleted and written again at the delivery's date,
   so stock on hand and every daily report recalculate from the ledger.
   It is refused if any product would go below zero, and each changed
   quantity is kept in `stock_receipt_corrections` with the reason.

15. Drinks empties are owed per order, as in Bilikis. Each order that comes
   back short is a line in `empty_shortage_lines`:
   Outstanding = expected − (returned with the trip + follow-ups), never
   below 0; open while above 0, completed at 0, and it stays listed with
   the time it was completed. Follow-ups (`record_empties_followup`) pay off
   one line only and never more than it still owes, and only owners and
   admins record them. Extra empties at the
   trip go into the store but are not credit, so a customer never has a
   balance below zero; old debts and customer adjustments are refused for
   drinks. Empties in store = opening + trip returns + follow-ups +
   adjustments − taken by the supplier. Orders for several customers are
   saved together (`create_order_batch`), with stock checked for the whole
   list. A drinks order is either RGB or PET (trigger
   `drinks_order_one_kind`); `order_summaries` carries each order's empties
   sent out, brought back and left to complete.
   Drinks are sold to saved customers only (trigger
   `drinks_orders_need_a_customer`), so every order and every crate owed
   has a name; walk-in buyers are for other businesses.

## How screens are laid out

Every page uses the same pieces from `src/components/ui`: `PageHeader`
(title, one line, main action first), `FilterBar` with `SearchForm` and
`StatusTabs`, and `DataTable` inside a `TableCard`. On a phone the table's
rows become cards (see `.data-table` in `globals.css`), so nothing scrolls
sideways. Lists only show and link; anything that changes a record (edit,
switch off, void, correct) is in the `ActionsPanel` on that record's page.

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

## Emails

Supabase Auth sends the sign-up and password-reset emails; the app sends none
itself. The branded versions live in `supabase/templates/` and the local
Supabase uses them (see `supabase/config.toml`). For the hosted project,
paste each file into Authentication -> Emails -> Templates:

| Template | File | Subject |
| --- | --- | --- |
| Confirm signup | `confirm-signup.html` | Confirm your BukAm account |
| Reset password | `reset-password.html` | Reset your BukAm password |
| Password changed (security notification) | `password-changed.html` | Your BukAm password was changed |

Keep `{{ .ConfirmationURL }}` in the first two: it is the link. Send through
a real mail service (custom SMTP), because Supabase's built-in sender is only
for testing and allows very few emails an hour.

## Moving to a new web address

When the app's address changes (for example to a custom domain), three
places must be told, or sign-up emails and Telegram stop working:

1. The host: set `NEXT_PUBLIC_SITE_URL` to the new address and redeploy.
2. Supabase, under Authentication → URL Configuration: set the Site URL to
   the new address and add `<new address>/**` to the redirect URLs.
3. Telegram, if it is set up: open the `setWebhook` address from the section
   above again, with the new app address in it.

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
| 7 | Serial-numbered products (serial and colour per unit, colour then serial when selling), counter sales, walk-in buyers, serial lookup with warranty | Done |
| 8 | Forgot password, sign-up questions that shape the app, stock write-offs and corrections, search and paging on long lists, browser walkthroughs in the repo | Done |
| 9 | Two kinds of business: shops that count goods and shops that sell by serial number, each with its own words, menu and defaults; delivery as its own choice | Done |
| 10 | Drinks, the Bilikis way: one Empties pool, each drink RGB or PET, price and cost required, opening empties as an adjustment, empties given to the supplier on the delivery itself, empty shortages and customers bringing empties back | Done |
| 11 | Running a drinks depot like Bilikis: drink categories (RGB, PET, Juice, Energy, Can, Water), stock by category, stock value at cost, a drivers and loaders list chosen per trip, the NBC product list to add from, and a daily report with deliveries, empties in and out, and empty shortages | Done |
| 12 | Bilikis rules for drinks: whole crates and empties, one waiting RGB order per customer, 10-character reasons, buying cost kept per delivery with stock valued at the average, truck required on trips | Done |
| 13 | One simple customer form for everyone; correcting a delivery after the fact (date, supplier, reference, products and numbers), as in Bilikis | Done |
| 14 | Write-offs removed; stock changes only through deliveries and orders | Done |
| 15 | Reorganised screens: a grouped side menu (daily work, catalogue, reports, admin) with New order and Receive stock at the top; every list a table with search and status tabs that turns into cards on a phone; changes such as edit, switch off and void on each record's own page | Done |
| 16 | Trips take their driver from the list and at least one worker (any number); trucks and plate numbers are no longer recorded | Done |
| 17 | Order form: walk-in buyer at the bottom, and a missed customer, product or quantity is pointed out at the field itself; a waiting order is cancelled (void is only for one that has gone out); "Put on a trip" from the order page; returned-empties boxes start blank and every one must be filled, 0 included | Done |
| 18 | Drinks the Bilikis way: an order screen for several customers with a live "Stock left" on every product; empty shortages kept per order with follow-up returns, a shortages page (open and completed, with when each was completed), no credit | Done |
| 19 | Empty exchanges on their own page (list, new exchange, one record each) instead of on the stock-in form; drink products no longer ask "sold by", and the RGB/PET choice and PET category start empty | Done |
| 20 | Drinks orders are RGB or PET, never both: New order has RGB and PET tabs, and the orders page shows RGB orders (sent out, brought back, left to complete) above PET orders; one trip still carries both | Done |
| 21 | One New order page for drinks (RGB and PET tabs, several customers); the one-order address (`?single=1`) redirects here. Drinks are sold to saved customers only: no walk-in buyers for RGB or PET, enforced in the database. Phone and goods shops keep walk-in buyers on their one-order form | Done |
| 22 | Stock is the Stock in list only (every delivery received). Stock summary is its own page in the menu: everything in the depot at the close of any day (stock per product by category, cards, and the empties: in store, back with trips, follow-ups, adjustments, taken by the supplier) | Done |
| 6b | Billing for the plans, and what happens when a trial ends | Next |
