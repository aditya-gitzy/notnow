# Phase 5 — fairness evidence

**Goal:** Make the fairness claim measurable with repeatable test traffic, a labeled baseline, and a buyer-readable outcome. Estimated time: 4:45–5:30. Start only after the buyer flow and Phase 3 concurrency checks pass.

## Build

1. Add a Node.js/TypeScript simulator using the same HTTP API as buyer clients. Implement ordinary, same-account retry, and flood profiles. Cap concurrency and label every run and client. Optionally add a multi-account profile as a known identity limitation.
2. Store each run's seed, eligible population, inventory, request schedule, client profiles, start/end times, and results in `simulation_runs`. Isolate runs from the live demo sale and from each other.
3. Run a simple first-request-wins baseline on the same logical population, inventory, and seed. Label it as a model, not a real competitor system. Keep its outcomes separate from live `orders`.
4. Build `/admin/events/[eventId]/lab` with simulation controls and a results table. Show allocation rate by cohort, request-to-allocation ratio, throttled requests, oversells, duplicate orders, and queue integrity violations. Show p50/p95 latency only if collected consistently. Charts are optional.
5. Add a buyer fairness receipt showing accepted entry time, ordering policy/version, final position, admission and purchase outcome, and reason codes. Do not imply that a queue position guarantees a ticket.
6. Show configuration and limitations next to every result: simulated logical buyers are not concurrent browser connections; one account per person is not proven; account farms and production-scale load are untested.

## Acceptance checks

- Re-running the same configuration produces comparable outcomes without mixing run IDs or corrupting demo orders.
- Same-account retries do not create additional eligible entries or confirmed orders.
- The Lab clearly separates baseline model results from Fair Drop API results and displays request counts alongside allocations.
- A buyer can understand their own outcome from the receipt and reason code.

## Handoff to Phase 6

Phase 6 needs a reproducible simulator command and the exact claim supported by the measurements. Record sample configuration, seed, result location, measured scale, latency method if any, and limitations.

### Handoff record

_Fill in after implementation: files/commits, commands, results, and open issues._

Implemented in `web/`:

- `src/lib/fairness-lab.ts`, `scripts/run-fairness-lab.mjs`, `scripts/verify-phase5.mjs`: bounded HTTP simulator, independent seeded runs, baseline model, and integration check.
- `db/schema.sql`: run/event links and simulation accounts; `src/lib/queue-operations.ts`: seeded hash ordering for lab events.
- `src/components/fairdrop/FairnessLab.tsx` and `/admin/events/[id]/lab`: organizer controls and cohort results; `src/components/fairdrop/QueueExperience.tsx`: buyer fairness receipt.

Reproduce: start the web app, set `LAB_BASE_URL` to its URL, then run `node scripts/verify-phase5.mjs` from `web/`. For one configured run, use `node scripts/run-fairness-lab.mjs` with optional `LAB_SEED`, `LAB_POPULATION`, `LAB_INVENTORY`, `LAB_CONCURRENCY`, and `LAB_SOURCE_EVENT_ID`. Example: seed `fairdrop-demo-1`, 12 logical buyers, 5 tickets, concurrency cap 6. Results are in `simulation_runs` and `/admin/events/:id/lab`; each run has its own event and accounts.

Two isolated runs with that example configuration produced the same cohort allocations (ordinary 2/4, same-account retry 2/4, flood 1/4) and the same counts: 110 buyer requests, 16 HTTP 429 responses, 5 orders, 0 oversells, 0 duplicate orders, and 0 queue integrity violations. The first-request-wins baseline model allocated 0/4 ordinary, 1/4 retry, and 4/4 flood, using the same generated arrival schedule. These measurements support the narrow claim that, in this local simulated scenario, extra requests from the same account did not create extra eligible entries or duplicate orders, while the queue produced an allocation pattern different from the first-request-wins model. They do not establish one human per account, resistance to account farms, or production-scale performance.

Latency p50/p95 is measured from the Node simulator's HTTP request start until the parsed JSON response for buyer API calls. It varies across reruns and is not a browser or distributed load measurement. Logical clients are Node HTTP requests, not simultaneous browser connections. The integration check passed with separate run IDs, comparable cohort results, throttling, zero oversells/duplicates, source event orders unchanged, and a readable buyer receipt.
