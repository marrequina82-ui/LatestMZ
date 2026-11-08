# MZ Crafties crochet tracker

React frontend and Node.js backend connected to the Supabase HTTPS Data API. Supabase stores data in PostgreSQL; the app does not need a direct database connection when API mode is configured.

## Supabase API setup (recommended)

1. Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in the root `.env` using your Supabase project URL and server secret key (`sb_secret_...`). Never put the secret key in a `VITE_` variable or frontend code. API mode takes priority over any existing `DATABASE_URL`.
2. Run `server/schema.sql`, then `server/supabase-api.sql` in the Supabase SQL Editor. These scripts preserve existing records and install the private API function, permissions, and history triggers.
3. If no account has a PIN yet, run `SELECT assign_account_pin('your-email@example.com', 'YOUR_SIX_DIGIT_PIN');` in the SQL Editor, replacing the placeholders.
4. Run `npm.cmd run dev` and open http://localhost:5173. Startup checks the remote API function. All PIN checks and mutations run through server-only RPC calls; mutations and their history use one database transaction.


The sections below also describe the optional older direct PostgreSQL connection mode.

## Local setup

Use Node.js 22.12 or newer (Node.js 24 recommended).

1. Run `npm.cmd ci` in the repository root and `npm.cmd --prefix client ci`.
2. Copy `.env.example` to `.env`. Set `DATABASE_URL` to your private Supabase PostgreSQL connection URL from Connect. Use the session pooler for IPv4. Keep credentials out of frontend variables and source control.
3. For an empty Supabase database, import `.local/MZ-Supabase-import.sql` once to preserve existing accounts, images, inventory and history. Never rerun the snapshot against populated application tables. For a new empty workspace without a snapshot, the backend creates its schema on startup.
4. Run `npm run dev` in the repository root. This starts both the Node.js API and React frontend. Open http://localhost:5173. Press Ctrl+C to stop both. Frontend changes use Vite hot reload; restart the command after backend changes.

For backend-only operation, use `npm.cmd start` or `powershell -ExecutionPolicy Bypass -File .\Start-TrackerBackend.ps1`.

The API uses TLS certificate verification with the bundled Supabase CA certificate in `server/certs/supabase-ca.crt`. To override it, set `SUPABASE_CA_CERT` to your downloaded PEM certificate, using literal `\n` for newlines in `.env`. The local server initializes `server/schema.sql` without deleting existing data.


## Accounts and history

Public signup is disabled. All provisioned admins share the same workspace. Existing six-digit PIN hashes remain compatible; leading zeroes are supported. Sessions last seven days; logout revokes the current session. PIN attempts are limited to five per fifteen minutes per direct connecting IP, held in memory. Serverless instances have independent limits and restarts reset them; add a shared rate limiter before expanding this private workspace to a wider audience.

Run this in the Supabase SQL Editor to assign or reset a PIN:

```sql
SELECT assign_account_pin('person@example.com', 'CHANGE_ME');
```

Replace `CHANGE_ME` with a private six-digit PIN. The function preserves projects and revokes that user's previous sessions. Keep users, sessions and history private: this app accesses them only through its server database credentials, not the browser Supabase client. Do not grant public API roles access to these tables.

Project and stock changes record the acting admin through a transaction-local setting and PostgreSQL trigger. Changes and activity are committed together. Stock updates reject outdated quantities; refresh inventory after a conflict. History includes deleted project names and the acting admin's email.

## Storefront and pricing

Positive-stock products appear in the public shop. The public catalog exposes only IDs, names, images, currencies, prices and quantities. Patterns and cost breakdowns stay private. Set `SHOP_FACEBOOK_URL`, `SHOP_MESSENGER_URL` and `SHOP_EMAIL` in the server environment to enable contact links. Customer inquiries do not reserve inventory or create confirmed orders.

Suggested price = (yarn + supplies + hours x hourly rate) x (1 + overhead / 100) x (1 + profit / 100). Currency selects input units without conversion. Upload JPG, PNG or WebP images up to 5 MB and enter patterns manually.

## Verification

### Automatic stock deduction for sales

For an existing Supabase workspace, run `server/sale-stock.sql` once in the
Supabase SQL Editor. New databases initialized from `server/schema.sql` include
this trigger automatically. This also works when the backend uses the Supabase
HTTP API; no replacement of `tracker_api` is required.

Sales history includes an Undo action. Undo marks a sale as undone, restores its stock once, and excludes it from totals while preserving the receipt. Existing workspaces must rerun `server/sale-stock.sql` to enable Undo.

Each appended sale deducts its quantity in the same transaction as the sale.
Insufficient stock or a stale sales history rejects the entire update. Retrying
the same saved sales history does not deduct stock twice. This migration does not
retroactively deduct earlier sales, because stock may already have been adjusted
manually. Reconcile those quantities in Stocks once.

To run the PostgreSQL regression test against a configured direct database:

```powershell
$env:RUN_DATABASE_TESTS='true'
node --env-file=.env --test server/sale-stock.test.js
Remove-Item Env:RUN_DATABASE_TESTS
```

The regression test uses a temporary table and rolls back all test data and DDL.

```powershell
npm test
npm run lint
npm run build
```

API tests cover input validation, public data filtering, transaction rollback, session protection, request origin checks, actor attribution and stock conflicts. Live Supabase verification additionally requires your configured database.

## Materials inventory setup

If materials inventory fails while projects still load, rerun `server/supabase-api.sql`
in the Supabase SQL Editor. Older deployed versions of `tracker_api` do not include
`materials_list` and return "Unsupported operation". The updated SQL creates the
materials table if needed, adds list/create/update/delete operations, and grants
access only to the backend service role. Existing records are preserved.
