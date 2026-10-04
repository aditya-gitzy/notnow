# Phase 6 — verification and demo

**Goal:** Verify the complete prototype from a clean run, fix defects, and rehearse a defensible demo. Estimated time: 5:30–6:00; allow more time if a correctness check fails.

## Verify and finish

1. Run the architecture §14 checklist: final-ticket concurrent reserve, ten repeated joins, concurrent confirm, confirm-versus-expire, refresh/reconnect, buyer/admin authorization, simulation isolation, and invariant after every test.
2. Start from the documented reset/seed path and walk the full buyer flow: event page → join → queue order → admission → reservation → confirmation. Check expired and sold-out explanations as applicable.
3. Run ordinary, retry, and flood scenarios with a fixed seed. Capture the configuration and observed allocations, request counts, throttles, oversells, and duplicate orders. Fix any mismatch between the Lab and database.
4. Rehearse the architecture §15 demo path, including the fairness receipt and the identity/scale limitations. Use this precise claim only if supported: under the displayed test configuration, extra requests from the same account did not create extra queue entries or orders, and inventory remained consistent.
5. If time and credentials permit, deploy to Vercel/Supabase and repeat the critical smoke flow against the deployed environment. Record the tested environment and scale. Deployment is not evidence of 50,000 concurrent users.
6. Update the top-level README or demo instructions with setup, environment variables, migration/seed/reset commands, test and simulator commands, and known limitations.

## Exit checks

- All eight architecture §14 verification items pass, with commands/results recorded.
- A clean reset supports the full demo without manual database editing.
- The presented fairness claim matches measured data and the stated test scale.
- Any failed check or untested capacity is explicitly recorded rather than presented as verified.

## Final handoff record

_Fill in after implementation: files/commits, setup and demo commands, test results, deployment URL if applicable, tested scale, and remaining limitations._

## Final handoff record — implemented 2026-10-03

- Added `web/scripts/verify-phase6.mjs` for a clean reset and complete buyer HTTP flow, `web/scripts/audit-phase6-db.mjs` for direct database reconciliation, and an isolated-directory option in `web/scripts/seed-phase3-fixtures.mjs`. Added the root `README.md` with setup, commands, demo steps, environment settings, and limitations.
- Tested locally with Next.js production server, PGlite at `web/.data/phase6-verification-20261003`, and port 3002. The ordinary demo remains on port 3000. No Vercel/Supabase credentials or deployment URL were available, so hosted smoke and 50,000-user capacity were not tested.
- `BASE_URL=http://localhost:3002 node scripts/verify-phase6.mjs`: passed. Fresh reset event `e5bd1834-f0ac-43d6-ad4c-8a5535be0898`; ten simultaneous joins produced one entry; position 1 persisted across status calls; buyer/admin authorization and cross-account confirmation were denied; join → order → admit → reserve → reconnect → confirm succeeded; receipt showed confirmed purchase; inventory balanced at each checkpoint.
- After stopping the app, `PGLITE_DATA_DIR=.data/phase6-verification-20261003 node scripts/seed-phase3-fixtures.mjs` created the three race fixtures. Restarted the app and ran `verify-phase3.mjs` with its JSON in `PHASE3_FIXTURES` and the port 3002 `BASE_URL`: passed. The final ticket had one reserve winner, two simultaneous confirms yielded one order, an expired hold released its ticket, the confirm/expire race ended in one order, and reconnect returned the same hold/order. Inventory remained balanced.
- Twice ran `scripts/run-fairness-lab.mjs` against port 3002 with seed `phase6-demo-fixed`, 12 logical buyers, 5 tickets, concurrency cap 6. Run IDs `4bef6bd1-b4d0-487a-b2cd-bf141b169ad8` and `be8619d4-24ee-40f0-a3a4-28a50b6262d9` used separate events. Both had 12 accepted entries, 110 buyer requests, 16 HTTP 429s, 5 allocations, zero oversells, zero duplicate orders, and zero queue integrity violations. Cohorts in both: ordinary 2/4 allocations from 11 requests; same-account retry 1/4 from 25 requests; flood 2/4 from 74 requests. The first-request-wins baseline model yielded ordinary 0/4, retry 1/4, flood 4/4. Latency p50/p95 varied between runs because it measures local Node HTTP start to parsed JSON response, not browser or production latency.
- Stopped the server and ran `PGLITE_DATA_DIR=.data/phase6-verification-20261003 node scripts/audit-phase6-db.mjs`: passed across 7 events and 2 completed Lab runs. Event inventory was balanced, queue entries and orders were unique per account, and Lab accepted-entry/allocation/sold counts matched database rows.

### Architecture §14 checklist

1. Final-ticket simultaneous reserve: **pass**, one winner and no oversell (`verify-phase3.mjs`).
2. Ten repeated joins: **pass**, one entry and stable position (`verify-phase6.mjs`).
3. Concurrent confirm: **pass**, one order and one inventory transfer (`verify-phase3.mjs`).
4. Confirm versus expire: **pass** in the tested ordering, one order; the separately expired hold released its ticket (`verify-phase3.mjs`). This is a local race scenario, not exhaustive scheduling proof.
5. Refresh/reconnect: **pass**, same entry, position, hold, and order (`verify-phase6.mjs`, `verify-phase3.mjs`).
6. Buyer/admin authorization and account binding: **pass**, buyer admin access denied and another buyer could not confirm the hold (`verify-phase6.mjs`, `verify-phase3.mjs`).
7. Simulation isolation: **pass**, distinct run/event IDs, matching cohort outcomes, and no mixing with the demo event (`run-fairness-lab.mjs`, prior `verify-phase5.mjs`).
8. Inventory invariant: **pass** at API checkpoints and in the final audit of all seven isolated events (`verify-phase6.mjs`, `verify-phase3.mjs`, `audit-phase6-db.mjs`).

Defensible demo claim: **Under the displayed local test configuration, extra requests from the same account did not create extra queue entries or orders, and inventory remained consistent.** One human per account, resistance to account farms, simultaneous browsers, hosted database behavior, and production-scale throughput remain unverified. Invitation-backed account controls were started separately and are incomplete. The first-request-wins comparison is a model, not a measured competitor system.
