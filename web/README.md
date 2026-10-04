# Fair Drop web app

Phases 1 through 5 of the Fair Drop prototype. The landing page adapts the ForumX Conference Template's bold event hero, blue accent, and spacious layout. The original template's MIT license is preserved in `LICENSE`.

## Run locally

```powershell
cd web
npm install
npm run dev
```

Open `http://localhost:3000`. Local development creates a durable PostgreSQL-compatible PGlite database in `web/.data/pglite`, applies `db/schema.sql`, and seeds one open demo event plus six buyer accounts. The initial entry window closes 24 hours after the first seed. Use **Start fresh demo** in the organizer console to create a new open event while preserving old events and simulation results. `PGLITE_DATA_DIR` can select an isolated local test database.

For hosted PostgreSQL (including a Supabase PostgreSQL connection), set `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_SECRET`, `RECAPTCHA_SITE_KEY`, and `RECAPTCHA_SECRET_KEY` from `.env.example`. The app applies the same schema and initial seed on first access. Never put secrets in `NEXT_PUBLIC_` variables. The ignored local `web/.env.local` holds a generated organizer secret for the demo. The first page offers Attendee and Organiser access. For local demos, `RECAPTCHA_TEST_MODE=true` uses Google's public test keys; they always pass and provide no bot resistance. Use real keys on a deployed site.

`npm run build` checks the production bundle. `npm run start` also requires `SESSION_SECRET`, even when using the local database. When `DATABASE_URL` is set, the server reads and writes Supabase PostgreSQL; the browser never receives the database password.

### Move the existing demo into Supabase

1. Create a Supabase project. In its dashboard, select **Connect → Session pooler** and copy its PostgreSQL URI. The session pooler uses port 5432 and works on IPv4-only networks. A direct connection is also suitable when your network supports IPv6. Add `?sslmode=require` to the URI (or `&sslmode=require` if it already has query parameters). Replace the password placeholder with your database password, percent-encoding reserved URL characters. If Node reports `SELF_SIGNED_CERT_IN_CHAIN` for the pooler, add `&uselibpqcompat=true`; that keeps TLS encryption but does not verify the server certificate. For certificate verification, use `sslmode=verify-full` with your project's downloaded CA certificate.
2. **Stop the local Next.js server** so the PGlite database does not change during copying. Keep `web/.data/pglite` as your local backup.
3. From `web/`, run `npm run migrate:to-supabase -- --plan` to review local table counts. Put the URI in the ignored `web/.env.local` as `DATABASE_URL=...`. Keep it server-side; do not use a `NEXT_PUBLIC_` variable or paste the password in chat.
4. Run `npm run migrate:to-supabase`. It requires an empty destination, applies the schema, copies all Fair Drop tables in one transaction, checks row counts and inventory balance, and enables RLS while revoking `anon` and `authenticated` access to the tables. A failed copy rolls back and leaves local data untouched.
5. Restart with `npm run start` (rebuild first if you changed source files). The app uses Supabase whenever `DATABASE_URL` is set. Open `/admin` and the attack results page to confirm the existing data appears.

The PostgreSQL connection needs no Supabase client key. Attendee email OTP uses Supabase Auth separately and needs `SUPABASE_PUBLISHABLE_KEY`. The bot simulator worker still runs in the local Node process; Supabase stores its events and results but does not turn it into a durable hosted job queue.

### Attendee email OTP

Copy the project's publishable key from **Supabase → Project Settings → API Keys** into the ignored `web/.env.local` as `SUPABASE_PUBLISHABLE_KEY=...`, then restart the app. In **Authentication → Email Templates → Magic Link**, put `{{ .Token }}` in the template body so attendees receive a code they can type. Supabase's built-in email service may send only to approved project addresses until custom SMTP is configured. The local demo-account option remains available on `/auth` for judging without email delivery. Email OTP verifies inbox access; it does not prove that each account belongs to a different human.

## Current routes

- `/` - starts the journey at `/auth`
- `/auth` - attendee sign-up/log-in with email OTP, local demo-account fallback, or organiser access; signed-in users can continue to their area
- `/about` - public explanation and original event landing
- `/events` - signed-in attendee catalog of organiser-created events plus the active demo event
- `/admin/events` - organiser event creation and management list; new events include an event date, venue, and optional HTTPS image URL
- `/event/:id` - signed-in attendee event details and reCAPTCHA-protected waiting-room entry
- `/waiting-room?event=:id`, `/waitlist?event=:id`, `/confirm?event=:id`, `/ticket?event=:id` - attendee journey backed by the selected event's server-stored entry, hold, and order
- `/queue` - authoritative account status, reservation timer, and simulated checkout; jittered status polling every 20–30 seconds while waiting, 5–7 seconds during checkout, paused in hidden tabs
- `GET /api/events/:id` - public event data
- `POST /api/events/:id/join` - join or resume the one queue entry for the signed-in account
- `GET /api/events/:id/me` - authoritative buyer state
- `GET /api/demo-accounts` and `POST /api/session` - demo account selection
- `POST /api/admin/session` - separate organizer session, enabled when `ADMIN_SECRET` is configured
- `/admin` - organizer login; signed-in organizers continue to `/admin/events`
- `/admin/events/:id` - organizer controls, metrics, decisions, and safe fresh-demo action
- `/admin/events/:id/lab` - organizer-only Fairness Lab with isolated simulation runs and cohort results
- `GET /api/admin/events/:id/lab` and `POST /api/admin/events/:id/lab/run` - run history and simulator launch
- `GET /api/admin/events/:id` - organizer event and queue summary
- `GET /api/admin/events/:id/metrics` - inventory, queue, request, order, and audit metrics (organizer only)
- `POST /api/admin/events/:id/open-entry` - draft to open transition
- `POST /api/admin/events/:id/close-entry` - freeze and randomly order eligible entries once
- `POST /api/admin/events/:id/start-sale` - enable admission after ordering
- `POST /api/admin/events/:id/admit` - admit up to the active capacity; requires an `Idempotency-Key` header
- `POST /api/events/:id/reserve` - admitted buyer reserves one ticket; requires an `Idempotency-Key` header and JSON object body
- `POST /api/reservations/:id/confirm` - owner confirms simulated purchase; repeated calls return the same order
- `POST /api/admin/events/:id/expire-holds` - release due holds and restore stock
- `POST /api/admin/events/:id/reset-demo` - idempotently create and select a fresh demo event

Demo accounts are intentionally selectable, so they demonstrate account-level uniqueness rather than one-human-one-account identity. A buyer who has joined keeps the same entry and position across refreshes. Late joins are rejected after close. Reserve, confirm, and expiry use database transactions and keep inventory balanced. Due holds are released on buyer status, organizer summary, admission, reservation, and the organizer trigger. There is no background scheduler yet, so holds may remain in the database until one of these paths runs.

Join requests allow 12 per signed account and 120 per proxy address per event per 60-second fixed window. Status requests allow 90 per account per minute through a per-process memory guard, avoiding database writes on ordinary status reads. Excess returns HTTP 429 with `RATE_LIMITED` and `Retry-After`; throttled decisions are audited. Join limits are database-backed across app instances, but status limits must also be enforced at a shared ingress when multiple instances are deployed. The proxy must supply a trustworthy forwarded address for the join address limit. Demo account selection is intentionally open, so this is not proof of one human per account. Database rate-limit bucket rows are not automatically pruned yet.

To check local database constraints after at least one account has joined, stop the app and run `node scripts/check-phase1-db.mjs`. It checks the inventory and unique-entry constraints and creates a closed test event for API verification.

For the Phase 2 API check, stop the app and run `node scripts/seed-phase2-fixture.mjs`; save the event ID it prints. Restart the app, set `PHASE2_EVENT_ID` to that ID, and run `node scripts/verify-phase2.mjs`. The check covers the draft/open/close/selling transitions, unique frozen positions, late-entry rejection, batch capacity, idempotent admission, expiry, and the inventory invariant. It uses a separate event so the main landing page sale stays open.

For the Phase 3 API check, stop the app and run `node scripts/seed-phase3-fixtures.mjs`; save the JSON it prints. Restart the app, set `PHASE3_FIXTURES` to that JSON, and run `node scripts/verify-phase3.mjs`. It checks a simultaneous last-ticket reserve, duplicate confirm, conflicting idempotency key, owner binding, expiry and confirm races, reconnect state, and inventory totals. The fixtures are isolated from the landing page event.

For the Phase 4 check, use an isolated `PGLITE_DATA_DIR`: run `node scripts/seed-phase4-evidence.mjs`, start the app on port 3001 with that same variable, and run `node scripts/verify-phase4.mjs` (set `BASE_URL` if the port differs). Stop the app, then run `node scripts/check-phase4-evidence.mjs` with the same directory. This tests throttling, authorization, queue preservation, metrics, reset idempotency, and completed simulation evidence preservation without changing the main demo.

## Phase 5 Fairness Lab

The buyer status page includes a fairness receipt with accepted time, ordering policy, final position, admission and purchase outcomes, and reason codes. A position does not guarantee a ticket. The lab compares Fair Drop HTTP API outcomes with a labeled first-request-wins model; the model never creates orders. Each run has its own event and accounts and preserves the main sale.

To reproduce the Phase 5 check, start the app, then set LAB_BASE_URL to its URL and run `node scripts/verify-phase5.mjs`. The check creates two separate runs with seed `phase5-check`, 9 logical buyers, 3 tickets, and at most 4 simultaneous requests. It checks comparable cohort outcomes, throttling, zero oversells and duplicate orders, untouched source orders, run history, and a buyer receipt. For a single run, use `node scripts/run-fairness-lab.mjs`; override LAB_SEED, LAB_POPULATION, LAB_INVENTORY, LAB_CONCURRENCY, and LAB_SOURCE_EVENT_ID as needed. Supported bounds are 6-24 logical buyers, 1-population tickets, and 1-8 concurrent HTTP requests. Runs are stored in `simulation_runs` and visible at `/admin/events/:id/lab`.



## Hackathon attack demo — Phase 2 backend

The new attack-demo backend is isolated from the ordinary sale. An organizer-created simulation event can have a `demo_run_policies` row with four real server settings: request rate limiting, one entry per simulated identity, a one-use SHA-256 proof-of-work challenge, and `RANDOM` or `FIRST_COME` ordering. The existing protected sale and ordinary queue are unchanged. A demo actor is labeled HUMAN or BOT and has a trusted *simulated* identity key; this is not proof of a real person's identity.

For an isolated demo event, `POST /api/events/:id/demo-challenge` issues a nonce to a signed actor. The client finds an answer whose SHA-256 hash of `nonce:answer` starts with `000`, then sends `{ "challengeId": "...", "answer": "..." }` to the existing join route. Challenge, identity, account, and IP rejections are stored in `audit_events`. The organizer routes `GET/POST /api/admin/events/:id/attack-policy`, `POST /api/admin/events/:id/allocate`, and `GET /api/admin/events/:id/attack-metrics` expose the isolated policy, atomic seat allocation, and database-derived counters/feed. Policy changes are allowed only before any entries exist, so one run cannot mix settings.

`allocateDemoSeats` in `src/lib/demo-allocation.ts` locks the event, releases due holds, and assigns the next queued people to free numbered seats. A partial unique index prevents two active or confirmed holds from sharing a seat number. The event inventory check and transaction prevent overselling. Repeated calls also fill an expired seat from the next position; Phase 3 will provide the simulator's allocation/expiry tick. A demo winner receives a hold for the event's `reservation_ttl_seconds` (300 seconds in the fixture), and the existing confirmation endpoint completes checkout.

Phase 2 backend smoke: stop the app, set `PGLITE_DATA_DIR` to a fresh isolated directory, and run `node scripts/seed-attack-backend-fixture.mjs`. Start the app with that directory on port 3006. Set `PHASE2_ATTACK_FIXTURES` to the seed JSON and `BASE_URL=http://localhost:3006`, then run `node scripts/verify-attack-backend.mjs`. It checks challenge failure, duplicate identity rejection, rate-limit on/off behavior, random/first-come run isolation, numbered-seat allocation, metrics, and zero oversells/duplicate allocations. The larger simulator, reset control, screens, and comparison results belong to Phases 3–5.

Expiry smoke: after a backend fixture run with a queued third person, stop the test app. Set `ATTACK_EVENT_ID` to the defended event ID and run `node scripts/expire-attack-fixture-hold.mjs` with the same isolated `PGLITE_DATA_DIR`. Restart the app, run `node scripts/verify-attack-reallocation.mjs` with `BASE_URL` and `ATTACK_EVENT_ID`, stop it, then run `node scripts/check-attack-reallocation-db.mjs`. This confirms the third random position received seat 1 after its prior hold expired. It mutates only the isolated test fixture.

## Hackathon attack demo — Phase 3 simulator and reset

`src/lib/attack-simulator.ts` sends bounded, signed HTTP requests to this app's real `/join`, `/demo-challenge`, `/close-entry`, `/start-sale`, and `/allocate` endpoints. The simulator never calls another site. `src/lib/attack-runs.ts` creates separate events/accounts for each run. A fixed seed controls the request schedule and random draw. The organizer API `POST /api/admin/events/:sourceId/attack/run` starts a run and returns its run/event IDs immediately; `GET /api/admin/events/:runEventId/attack/run` reports status and saved results. `POST /api/admin/events/:runEventId/attack/reset` creates an empty READY event with the same configuration; `POST /api/admin/events/:newEventId/attack/launch` starts it. Reset preserves old runs for later comparison.

For a command-line run, start the app locally and run `node scripts/run-attack-demo.mjs` from `web/`. Set `BASE_URL` if the app is not on port 3000. Optional inputs are `ATTACK_SEED`, `ATTACK_BOTS`, `ATTACK_HUMANS`, `ATTACK_SEATS`, `ATTACK_RPS`, `ATTACK_FAKE_IDENTITIES`, `ATTACK_RETRY` (`none`, `repeat`, `aggressive`), `ATTACK_CHALLENGE_STRATEGY` (`ignore`, `solve`), `ATTACK_CONCURRENCY`, `ATTACK_MODE` (`RANDOM`, `FIRST_COME`), and `ATTACK_RATE_LIMIT`, `ATTACK_IDENTITY_LIMIT`, `ATTACK_CHALLENGE` (`off` disables each). Bounds: up to 3,000 bot accounts, 1,000 human accounts, 500 seats, 64 in-flight client operations, and 12,000 scheduled joins. The RPS input is a target cadence for each bot's retries; if retry mode is `none`, each bot makes one join request. Server capacity may lower actual throughput.

For the isolated Phase 3 check, start the app on port 3008 with a fresh `PGLITE_DATA_DIR`, set `BASE_URL=http://localhost:3008`, and run `node scripts/verify-attack-simulator.mjs`. It checks a live counter change, saved measured results, clean reset, a repeat run, run isolation, and zero oversells/duplicate allocations. The worker is intentionally in the local Node process for this hackathon demo; restarting the server mid-run can interrupt it. A hosted multi-instance deployment would need a durable job queue. The user-facing simulator panel and live dashboard are Phase 4.

Measured local example, seed `phase3-scale-check`, 500 bots, 500 simulated humans, 500 seats, concurrency cap 32, one join per actor: undefended first-come allocated 500/500 seats to bots in 20.1 seconds; undefended random allocated 258/500 to bots in 21.0 seconds and 258/500 again in 18.4 seconds with the same seed; random with identity and challenge enabled and bots scripted to ignore the challenge allocated 0/500 to bots in 40.5 seconds. Every run had zero oversells and duplicate allocations. A separate 100-bot/10-fake-identity run admitted 10 bot entries and rejected 90 duplicates. A 20-bot run with bots set to solve the simple challenge admitted all 20: this challenge alone does not prove human identity or stop adaptive bots. These are measured local HTTP simulations, not 500 simultaneous browsers or a production load test. The 500-bot run did not meet the requested few-second target; Phase 5 should measure and report the larger 3,000-bot case rather than assume its speed.
