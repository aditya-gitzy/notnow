# Phase 2 — queue ordering and admission

**Goal:** The organizer closes the entry window, the server assigns one stable random order, and buyers are admitted in controlled batches. Estimated time: 1:45–2:45.

## Build

1. Implement event transitions `DRAFT → ENTRY_OPEN → ENTRY_CLOSED → SELLING`. Reject invalid transitions with explicit reason codes. Use an event-level database lock for close/order and admission operations.
2. Add organizer-only `POST /api/admin/events/:id/close-entry`. Freeze the eligible entries and persist server-generated random positions, cutoff, eligible count, and ordering policy version. Repeated calls must return the existing order without reshuffling.
3. Choose the smallest late-join rule: close entry completely at cutoff. State that rule on the buyer page. Keep the join endpoint consistent with it.
4. Add organizer-only `POST /api/admin/events/:id/admit`. Select the next queued entries by persisted position, admit up to `batch_size`, and set admission expiry. Use an idempotency key so repeating the same organizer action returns the same batch. Enforce the configured capacity rule for outstanding admissions.
5. Update `/me` and queue UI to show assigned position, people ahead when computable, admitted state, and expiry. The server decides these values. Refresh must preserve position and admission.
6. Log ordering and admission decisions in `audit_events` without secrets.

## Acceptance checks

- One account retains one queue entry after repeated joins and refreshes.
- Closing twice leaves all positions unchanged; positions are unique for the event.
- Only eligible entries receive positions. A late join follows the published closed-entry rule.
- Admission selects the next positions, respects batch/capacity settings, and an identical retry does not admit another batch.
- Buyer requests cannot call organizer endpoints or assign their own position/admission.

## Handoff to Phase 3

Phase 3 depends on the persisted `ADMITTED` state, admission expiry, and session-bound queue entry. Record the precise admission validity rule, any token format, and the database function/API used to test admission during reservation.

### Handoff record

**Implemented:** `web/src/lib/queue-operations.ts` owns organizer transitions, one-time ordering, batch admission, expiry of admission windows, and organizer queue summaries. `web/src/lib/db.ts` now provides database transactions for local PGlite and hosted PostgreSQL. Buyer join uses the same event row lock as close/order. `web/db/schema.sql` adds `ordering_cutoff_at`, `ordered_at`, `ordered_count`, and `admission_ttl_seconds` for existing and new local events. `web/src/lib/event.ts` returns stable position, people ahead among still-queued buyers, and effective expiry state.

**Routes and UI:** Organizer-only APIs are `POST /api/admin/events/:id/open-entry`, `/close-entry`, `/start-sale`, and `/admit`, plus `GET /api/admin/events/:id`. `/admit` requires an `Idempotency-Key` header. `/admin` provides a secret-backed organizer login, controls, counters, policy details, and a queue table. `/queue` now displays position, people ahead, admission deadline, and expired state. The public landing page states the no-late-entry rule. The local organizer secret is stored in ignored `web/.env.local`; do not commit or expose it.

**Admission validity and capacity for Phase 3:** A buyer is currently eligible to reserve only if their signed buyer session matches `queue_entries.account_id`, the entry belongs to the event, `state = 'ADMITTED'`, and `admission_expires_at > now()` in the database. There is no admission token; the database row and signed session are authoritative. At most `batch_size` entries may be actively admitted at once. An active slot frees when an admission expires or the entry changes to `RESERVED` in Phase 3. `admitNext` marks due admissions `EXPIRED` before calculating free slots. `/me` and the organizer summary show effective expiry as soon as the deadline passes, even before that persisted cleanup. A new idempotency key represents a new admit action; the same key returns the stored original batch.

**Verification:** `npm run build` and `npm run lint` pass. The separate fixture created by `node scripts/seed-phase2-fixture.mjs` and tested with `PHASE2_EVENT_ID=<fixture-id> node scripts/verify-phase2.mjs` passed: draft opened; premature sale start rejected; five eligible accounts got unique positions 1–5; repeated close preserved them; a late sixth account got `ENTRY_CLOSED`; first admission selected positions 1–2; same-key retry returned that batch; a new key at capacity returned `CAPACITY_FULL`; after expiry, the next batch selected positions 3–4; inventory remained balanced. An unsigned admin request returned 403. The organizer page rendered for a signed admin session. The main seeded event remains open for the next phase/demo.

**Open issues:** No live Supabase connection was available to test. The local fixture uses a five-second admission window to exercise expiry quickly; the main event defaults to 120 seconds. Phase 3 must use a database transaction to move admitted entries into reservation state and enforce the deadline/one-ticket rule under races. Reservation and checkout UI are not built yet.
