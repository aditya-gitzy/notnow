# Phase 4 — organizer controls and abuse responses

**Goal:** An organizer can operate and observe a sale, while excessive buyer requests receive clear throttling without changing queue state. Estimated time: 4:00–4:45.

## Build

1. Build `/admin/events/[eventId]` behind the organizer session. Add event open/close controls as supported, close/order, admit next batch, and expire due holds. Make repeated control actions safe using the Phase 2/3 idempotency rules.
2. Implement organizer-only `GET /api/admin/events/:id/metrics`. Read inventory, queue depth, admitted/reserved/sold counts, throttled/error counts, and recent decisions from the database. Display whether `available + reserved + sold = total_inventory`.
3. Add simple account-based rate limiting on excessive join/status requests, with IP as a secondary signal. Return `429`, `RATE_LIMITED`, and retry guidance. A throttle response must not replace or delete the buyer's persisted queue state.
4. Emit audit reason codes for duplicate joins, throttling, expired admission/reservation, idempotency conflicts, and sold-out outcomes. Do not log secrets or full session cookies.
5. Add a safe demo reset path that creates a fresh run or clears only known seeded demo records. Preserve completed simulation runs and their results.
6. Check that admin controls cannot be invoked with a buyer session and metrics do not expose private account data through public routes.

## Acceptance checks

- Dashboard counters reconcile with database rows and the inventory invariant indicator passes after transitions.
- Buyer sessions receive authorization errors on organizer routes.
- A flood of same-account requests produces visible `429` responses without losing the account's queue entry or position.
- Reset yields a clean demonstrable event without silently rewriting completed run evidence.

## Handoff to Phase 5

Phase 5 needs stable admin metrics, audit reason codes, and a reset/isolation method for simulations. Record rate-limit thresholds, reset command, metric definitions, and known limits of the limiter.

### Handoff record

Implemented in `web/src/lib/organizer.ts`, `web/src/lib/abuse.ts`, the organizer pages and routes under `web/src/app/admin` and `web/src/app/api/admin/events/[id]`, and the dashboard in `web/src/components/fairdrop/AdminConsole.tsx`. The protected `/admin/events/:id` page shows sale controls, inventory, the balance check, queue and request counters, recent audit decisions, and a fresh-demo action. Existing open/close/order/admit/expiry controls retain their idempotency behavior.

`GET /api/admin/events/:id/metrics` is organizer-only. Inventory fields read the event row; `balanced` checks available + reserved + sold = total. Queue depth/admitted/reserved/confirmed/expired count queue entries by effective state. Hold counts group reservation rows by state; orders count `orders` rows. Throttled requests count `REQUEST_THROTTLED` audit rows and error requests count `REQUEST_REJECTED` rows. Recent decisions return the 20 newest audit type/reason/time records, without account IDs or cookie contents. Expiry runs before the metrics read.

The database-backed fixed-window limiter (`rate_limit_buckets`) allows 12 join and 90 status requests per signed account per event per 60 seconds. A secondary hashed proxy-address bucket allows 120 join and 600 status requests per event per 60 seconds. Excess returns 429, `RATE_LIMITED`, and `Retry-After`; the buyer's queue entry is untouched. Duplicate joins have `ALREADY_JOINED` audit reason codes. Throttles, expired admissions/holds, idempotency conflicts, and sold-out reserve attempts are audited. The address header needs a trusted proxy; the signed-account limit is the primary control. Open demo account selection does not establish one-human-one-account identity. Bucket rows currently have no pruning job.

`POST /api/admin/events/:id/reset-demo` requires organizer session and `Idempotency-Key`. It creates a new open event with fresh inventory, switches `demo_current_event`, and leaves prior event rows, orders, audits, and `simulation_runs` unchanged. Identical retries return the same new event; another reset against the old event returns `STALE_DEMO_EVENT`. The dashboard button uses this route. For Phase 5, use the new event ID from the response or `/admin` redirect for live demo runs; keep simulation records linked to their own run IDs.

Verification: `npm run build` and `npm run lint` passed. An isolated PGlite run used `PGLITE_DATA_DIR=.data/phase4-check-20261003b`, `node scripts/seed-phase4-evidence.mjs`, `npm run start -- -p 3001`, `node scripts/verify-phase4.mjs`, then `node scripts/check-phase4-evidence.mjs` after stopping the server. Results: 4 join 429s and 49 status 429s during the run, queue entry and position preserved, buyer denied organizer APIs, metrics balanced, reset idempotent, old event retained, and a completed simulation record unchanged. The exact throttle counts vary with fixed-window boundaries. Hosted PostgreSQL/Supabase remains untested without credentials.
