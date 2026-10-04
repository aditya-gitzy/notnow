# Phase 3 — transactional checkout

**Goal:** An admitted buyer reserves one ticket and confirms a simulated purchase; expiry releases stock. These operations remain correct under retries and races. Estimated time: 2:45–4:00.

## Build

1. Implement transaction-backed reserve, confirm, and expire operations as PostgreSQL functions or explicit SQL transactions. Follow architecture §9. Do not split inventory read and write across API requests.
2. `POST /api/events/:id/reserve` must check the signed session, event and admission, expiry, one-ticket rule, available stock, and idempotency key/request hash. Atomically move one ticket from available to reserved and create an active reservation. Return the stored response for an identical retry; reject a conflicting reuse of the key.
3. `POST /api/reservations/:id/confirm` must lock the reservation and event, validate ownership and expiry, atomically move one ticket from reserved to sold, and create one order. A repeated confirmation returns the same order.
4. Implement due-hold expiry with reservation row locks and state guards. Atomically move stock from reserved back to available. Call expiry before relevant admissions/reservations and expose an organizer trigger for the demo. Confirm and expire must contend on the same reservation row.
5. Build buyer reservation timer and simulated checkout. Use server expiry timestamps; refresh from `/me` before interpreting result. Show confirmed order ID or clear expired/sold-out state.
6. Add focused concurrency tests for last-ticket reserve, duplicate confirm, confirm versus expiry, and reconnect during an active hold.

## Acceptance checks

- Two simultaneous reserve calls for the final ticket yield one active reservation, zero oversells, and valid inventory totals.
- Two simultaneous confirmations yield one order and one transfer from reserved to sold.
- Confirm versus expire ends with either one order or one released ticket, never both.
- Identical retries return the same result; conflicting idempotency-key reuse is rejected.
- Refresh/reconnect shows the same reservation or order. A buyer cannot reserve for another account.

## Handoff to Phase 4

Phase 4 needs reliable counters and decision records. Record transaction function names, idempotency behavior, expiry trigger requirements, test command/results, and any missing scheduler limitation.

### Handoff record

Implemented in `web/src/lib/checkout.ts` with explicit PostgreSQL transactions through `web/src/lib/db.ts`. The transaction functions are `reserveTicket`, `confirmReservation`, and `expireEventHolds`/`expireDueHolds`. All three lock the event row first; confirm and expiry also lock the reservation row. Inventory transfers, reservation or order records, queue state, and audit records commit together. Database constraints provide the nonnegative/balanced inventory and one-order backstops.

Routes: `POST /api/events/:id/reserve`, `POST /api/reservations/:id/confirm`, and organizer `POST /api/admin/events/:id/expire-holds`. The buyer status route returns the current reservation or order. `QueueExperience.tsx` shows a server-deadline hold timer, confirm action, and order ID. `AdminConsole.tsx` shows inventory counters and an expiry trigger.

Reserve requires a signed buyer session, current admission bound to that event/account, stock, and an 8–128-character `Idempotency-Key`. The request hash is SHA-256 of the parsed JSON body. A completed identical retry returns the stored response, including a stored failure; reuse with another body returns `IDEMPOTENCY_CONFLICT`. A different key for a buyer with an active hold returns that same hold. Confirm repeats return the same order. Confirmation requires ownership and uses the reservation's database deadline.

Due expiry runs before buyer `/me`, organizer event summaries, admissions, and reserve, plus the explicit organizer trigger. There is no periodic background scheduler; a quiet event may retain a due hold in storage until one of those paths executes. Phase 4 should keep this trigger or add a scheduler before claiming fully automatic release.

Verification: `npm run build` and `npm run lint` passed. For the local API test, stop the app, run `node scripts/seed-phase3-fixtures.mjs`, restart the app, set `PHASE3_FIXTURES` to its JSON output, then run `node scripts/verify-phase3.mjs`. The run passed: simultaneous final-ticket attempts had one winner; duplicate confirmations returned one order; expired hold released stock; confirmation concurrent with an expiry trigger produced one order; reconnect showed the same hold/order; owner check, key conflict, and inventory balances passed. Test fixtures are separate from the main event. Hosted Supabase PostgreSQL has not been exercised without credentials.
