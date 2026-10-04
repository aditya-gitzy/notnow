# Phase 1 — foundation and durable join

**Goal:** A buyer can view the event, enter through a demo account session, join once, and recover the same authoritative state after refresh. Estimated time: 0:00–1:45.

## Build

1. Initialize the Next.js App Router and TypeScript app, Supabase PostgreSQL connection, and basic styling. Seed one event and fixed demo accounts.
2. Create the core schema in architecture §8: `events`, `demo_accounts`, `queue_entries`, `reservations`, `orders`, `idempotency_records`, `audit_events`, and `simulation_runs`. Add nonnegative inventory checks, the inventory-sum check, unique `(event_id, account_id)` queue entries, unique assigned positions, and unique orders per account/event. Later phases may add columns and functions.
3. Implement demo account selection/login using a signed HTTP-only cookie. Read the account from the verified cookie on buyer routes. Add a separate organizer session or secret-backed login for later admin routes. Keep server database credentials server-side.
4. Build the event page with event details, entry window, inventory summary, one-ticket rule, and published queue policy. Display server-provided event state.
5. Implement `GET /api/events/:id`, `POST /api/events/:id/join`, and `GET /api/events/:id/me`. Join must validate the entry window and use database uniqueness/conflict handling; repeated joins return the existing row without changing its timestamp or position. `/me` returns the account's actual state on every page load.
6. Build the initial queue page: call `/me` on load, poll every 2–3 seconds, show a pre-order status, and mark stale data if polling fails.

## Acceptance checks

- One event and demo accounts are seeded and visible.
- Ten repeated joins by one account produce exactly one queue entry and return the same entry ID. Refresh restores it.
- A client-provided `userId` cannot change the authenticated account. Entry outside the allowed window returns a clear reason code.
- The event inventory constraint holds in the database.

## Handoff to Phase 2

Phase 2 needs the event and queue schema, authenticated buyer context, join/resume behavior, and `/me` response shape. Record the actual event ID or seed command, migration command, local start command, endpoint shapes, and unresolved setup issues below.

### Handoff record

**Implemented (Phase 1):** `web/` contains the Fair Drop Next.js app. The landing page adapts ForumX's image hero, blue accent, and display typography while replacing conference navigation/content with the single-sale flow. `web/LICENSE` preserves the template license. The queue screen reads `/me` on load and polls every 2.5 seconds; it marks the last state stale during a connection failure. Buyer actions on the landing page use `getBuyerAction`.

**Data and identity:** `web/db/schema.sql` creates all eight core tables, inventory checks, unique `(event_id, account_id)` entries, unique assigned positions, and unique orders. `web/src/lib/db.ts` uses durable local PGlite at `web/.data/pglite` when `DATABASE_URL` is unset; it can connect to hosted PostgreSQL through `DATABASE_URL`. First access seeds one `ENTRY_OPEN` event, 500 available tickets, a 24-hour entry window, and six demo buyers. `GET /api/demo-accounts` returns the current event ID and buyer IDs. `POST /api/session` sets a signed HTTP-only buyer cookie. `POST /api/admin/session` uses a separate organizer cookie when `ADMIN_SECRET` is set. Server credentials are not exposed in the browser.

**Commands:** From `web/`, run `npm install`, `npm run dev`, `npm run build`, and `npm run lint`. Copy `web/.env.example` to `.env.local` when supplying hosted database and session values. Stop the server before running `node scripts/check-phase1-db.mjs` against local PGlite. See `web/README.md` for setup and routes.

**Verified:** Build and lint pass on Next.js 16.3.8. Ten joins from Avery returned `JOINED` once and `ALREADY_JOINED` nine times with one entry ID; a spoofed `userId` in each body did not change the authenticated account. `/me` restored that ID after refresh, including a browser refresh of Blake's queue page. An unsigned join returned `401 NOT_SIGNED_IN`; a signed join to a closed fixture returned `409 ENTRY_CLOSED`. Database checks rejected imbalanced inventory and a duplicate queue entry. The seeded event satisfied `available + reserved + sold = total_inventory`. Production dependency audit reported zero runtime advisories; remaining npm audit findings are in development lint dependencies.

**For Phase 2:** The current local event ID is discoverable from `GET /api/demo-accounts`; do not hardcode it because resetting `.data` creates a new one. Join currently checks the entry window before insert but does not lock against a simultaneous close/order operation. Phase 2 must make close/order and join mutually consistent under an event lock or equivalent transaction rule. Queue positions, admission, checkout, organizer controls, and a live Supabase connection are not yet implemented/tested. No Supabase credentials were available in this workspace.
