# Fair Drop — six-phase implementation plan

Use [architecture.md](../architecture.md) as the source specification. Work through these files in order. Each phase is sized so a new chat can read the architecture plus the current phase file, inspect the repository, and continue without relying on earlier chat history. The time ranges are estimates from the architecture's six-hour hackathon plan, not deadlines.

| Phase | Focus | Estimated time | Exit result |
|---|---|---:|---|
| [1. Foundation and join](01-foundation-and-join.md) | App, database, demo identity, event and join/resume | 0:00–1:45 | One account has one durable queue entry |
| [2. Queue ordering and admission](02-ordering-and-admission.md) | Freeze eligible set, assign positions, admit batches | 1:45–2:45 | Stable server-assigned positions and controlled admission |
| [3. Transactional checkout](03-transactional-checkout.md) | Reserve, confirm, expire, buyer checkout | 2:45–4:00 | Complete buyer flow with no oversell in concurrent tests |
| [4. Organizer controls and abuse responses](04-organizer-and-abuse.md) | Dashboard, counters, audit, throttle, reset | 4:00–4:45 | Organizer can run and observe the sale safely |
| [5. Fairness evidence](05-fairness-evidence.md) | Simulator, baseline, Lab, receipt | 4:45–5:30 | Repeatable comparison with honest limitations |
| [6. Verification and demo](06-verification-and-demo.md) | End-to-end checks, fixes, rehearsal, optional deployment | 5:30–6:00 | Verified demo from a clean run |

## Rules that apply to every phase

- Server and database state are authoritative. Browsers and simulator clients cannot set queue position, inventory, admission, or order outcome.
- Use server-side account identity from a signed HTTP-only session cookie; protect organizer routes separately. Do not expose database service credentials in the browser.
- Preserve one queue entry and at most one confirmed ticket per account and event.
- Preserve `available + reserved + sold = total_inventory` with nonnegative counters. Reserve, confirm, and expiry changes belong in a single database transaction each.
- Keep the scope to one event, one ticket type, one ticket per account, and simulated payment. Do not claim production capacity or universal bot prevention from the prototype.
- Treat the architecture's stack and route names as suggested implementation choices. Keep its state machine, trust boundaries, and transaction rules if using a different stack.

## Starting a new phase in a new chat

Provide the new chat with `architecture.md`, the relevant phase file, and this instruction:

> Implement Phase N of Fair Drop. First inspect the repository and the prior phase's handoff. Complete the phase's acceptance checks, then record what changed, how it was verified, and any remaining issue in the handoff section of the phase file. Keep the architecture's shared invariants.

At the end of each phase, fill in its **Handoff record** with the actual files, commands, test results, and open issues. The next phase should read that record; it should not assume that a planned feature was implemented.
