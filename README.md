# Fair Drop prototype

Fair Drop is a ticket sale demo with an account queue, organizer-controlled ordering and admission, transactional simulated checkout, a buyer fairness receipt, and an organizer Fairness Lab. The site source and detailed route documentation are in [`web/README.md`](web/README.md). The six phase plans and handoff records are in `phases/`.

## Start locally

```powershell
cd web
npm install
Copy-Item .env.example .env.local
# Set random SESSION_SECRET and ADMIN_SECRET values in .env.local.
npm run dev
```

Open `http://localhost:3000`. The app applies `db/schema.sql` and seeds an open event plus six demo buyers on first access. Local data is stored under `web/.data/pglite`; set `PGLITE_DATA_DIR` before starting to use an isolated database. Hosted PostgreSQL uses `DATABASE_URL`; set both secrets for production. Keep `.env.local` private. The protected-sale UI currently uses Cloudflare Turnstile test keys locally; they provide no real bot defense. The invitation-based account controls are still in progress.

To start a fresh demo without editing the database, sign in at `/admin` using `ADMIN_SECRET` and select **Start fresh demo**. Old events and Lab runs remain available. The organizer page for the current event is linked from `/admin`.

## Verify

Run `npm run build` and `npm run lint` from `web/`. Use a separate `PGLITE_DATA_DIR` for the following API checks so the active demo is unaffected.

1. Start the app with that directory and `PORT=3002`; run `node scripts/verify-phase6.mjs` with `BASE_URL=http://localhost:3002`. This resets to a fresh demo event and completes the buyer journey, including ten repeated joins, authorization, reconnect, receipt, and inventory checks.
2. Stop the app. With the same `PGLITE_DATA_DIR`, run `node scripts/seed-phase3-fixtures.mjs`; save its JSON output in `PHASE3_FIXTURES`. Restart on the same port and run `node scripts/verify-phase3.mjs` with `BASE_URL` and `PHASE3_FIXTURES`. This checks final-ticket reserve, duplicate confirm, confirm/expiry races, owner binding, reconnect, and inventory.
3. While the app is running, set `LAB_BASE_URL=http://localhost:3002`, `LAB_SEED=phase6-demo-fixed`, `LAB_POPULATION=12`, `LAB_INVENTORY=5`, and `LAB_CONCURRENCY=6`; run `node scripts/run-fairness-lab.mjs` twice. Compare cohort allocations and inspect the runs at `/admin/events/:id/lab` for the source event.
4. Stop the app and run `node scripts/audit-phase6-db.mjs` with the same `PGLITE_DATA_DIR`. It checks every event's inventory and unique entries/orders, plus Lab counts against stored entries and orders.

`web/scripts/verify-phase2.mjs`, `verify-phase4.mjs`, and `verify-phase5.mjs` provide additional phase-specific checks; see `web/README.md` for their setup. The Phase 6 results and all eight architecture checklist items are recorded in [`phases/06-verification-and-demo.md`](phases/06-verification-and-demo.md).

## Six-step demo

1. On `/`, show the event's published entry window and limited inventory. Select a demo buyer, join, refresh, and repeat join to show the same entry.
2. Sign in at `/admin` in another tab. Close entry; return to the buyer tab to show its assigned position and fairness receipt.
3. Start the sale and admit a batch. Return to the buyer tab to show admission.
4. Reserve a ticket, refresh to show the same hold, then confirm the simulated purchase. Show the receipt and organizer inventory.
5. Open the event's Fairness Lab. Run the fixed configuration above and show cohort request counts, allocations, throttles, and zero oversells/duplicate orders. Explain that the first-request-wins baseline is a model, not a competitor product.
6. State the measured claim and limits: **Under the displayed local test configuration, extra requests from the same account did not create extra queue entries or orders, and inventory remained consistent.** Logical Node HTTP clients are not browser connections; one person per account, account-farm resistance, and production-scale capacity are unverified.

The local Phase 6 run tested 12 logical buyers, five tickets, at most six simultaneous HTTP requests, and 110 buyer API requests per Lab run. No Vercel/Supabase deployment or large-scale load test was performed.
