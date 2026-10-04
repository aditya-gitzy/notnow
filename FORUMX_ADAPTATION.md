# ForumX → Fair Drop: template and UX implementation guide

## Decision

Use [ForumX Conference Template](https://github.com/jonathanrao99/ForumX-Conference-Template) as the visual foundation for Fair Drop. It is a free, MIT-licensed Next.js App Router project with TypeScript, Tailwind CSS, Framer Motion, and a strong event hero. Its published demo is linked from the repository. Keep the template's bold typography, blue accent, image treatment, and spacious layout; replace its conference content and ticket tiers with Fair Drop's single limited-seat sale.

**Source of functional truth:** [architecture.md](architecture.md). This guide describes how to adapt ForumX's UI and navigation; it does not replace the queue, identity, transaction, or simulation rules there. The six [implementation phases](phases/README.md) remain the build sequence.

**Product scope for the six-hour hackathon:** one event, one ticket type, one ticket per demo account, simulated payment, and a measured fairness demonstration. ForumX is a visual template; its existing ticket buttons do not implement a queue or checkout.

## 1. What ForumX actually contains

The following paths were checked against the template repository. Inspect the downloaded version before editing because upstream files can change.

| ForumX path | Current role | Fair Drop action |
|---|---|---|
| `src/app/page.tsx` | Assembles the conference homepage | Rebuild as one event landing page with only useful sections |
| `src/components/forumx/HeroNextConfo.tsx` | Full-width image, blue headline, ticket CTA | Keep visual structure; change copy, date, image, and CTA state |
| `src/components/forumx/NavNextConfo.tsx` | Fixed animated header and many conference dropdowns | Replace menu with a short Fair Drop navigation; simplify behavior on queue/checkout routes |
| `src/components/forumx/AboutSection.tsx` | Conference description/countdown | Adapt to event details and published entry rule |
| `src/components/forumx/TicketsNextConfo.tsx` | Three paid pass tiers | Replace with **one ticket** information card and a state-aware join/status action |
| `src/components/forumx/FAQNextConfo.tsx` | Conference FAQ | Rewrite for queue, refresh, one-entry rule, holds, and sellout |
| `src/components/forumx/ReadyToJoinCTA.tsx` | Final ticket CTA | Reuse as a clear final waiting-room CTA if it adds value |
| `src/components/forumx/FooterNextConfo.tsx` | Conference footer | Replace brand, contact, policy copy, and stale links |
| `src/config/site.ts` | ForumX name, SEO, dates, location, social fields | Replace every ForumX fact with the actual Fair Drop demo event; omit unknown facts |
| `src/app/layout.tsx` and `src/app/globals.css` | Global shell, font, and styling | Keep the useful design tokens; make route-specific navigation possible |
| `src/components/seo/EventJsonLd.tsx` | Conference structured data | Update to real demo details or omit until details are settled |
| `src/app/agenda`, `speakers`, `blog`, `login`, `signup` | Conference/template pages | Remove or repurpose only if needed; avoid dead navigation |

ForumX currently has CTA links pointing to `/#tickets`, placeholder ForumX/San Francisco/2027 content, and three different price cards. Replace those before showing the site to anyone. Search the imported code for `ForumX`, `2027`, `San Francisco`, `Get a ticket`, `/#tickets`, and template URLs.

### Keep, adapt, remove

- **Keep:** hero composition, visual rhythm, responsive grid, blue accent, typography, simple reveal animation, FAQ treatment.
- **Adapt:** event image, countdown, nav, About, ticket block, bottom CTA, footer, metadata.
- **Remove from the MVP:** speakers, call for papers, technical program committee, sponsor lists, three ticket tiers, testimonials, and generic conference agenda. They distract from the scarce-seat queue story.

## 2. Recommended project shape

Keep the existing planning documents at the repository root and put the adapted Next.js app in `web/`:

```text
Fair Drop/
├─ architecture.md
├─ FORUMX_ADAPTATION.md
├─ phases/
└─ web/
   ├─ src/app/
   │  ├─ page.tsx                    # event landing
   │  ├─ queue/page.tsx              # waiting room and status
   │  ├─ checkout/page.tsx           # active reservation
   │  ├─ confirmation/page.tsx       # completed demo order
   │  ├─ admin/page.tsx              # sale dashboard
   │  ├─ admin/lab/page.tsx          # fairness results
   │  └─ api/...                     # buyer and organizer endpoints
   ├─ src/components/fairdrop/
   ├─ src/lib/
   ├─ public/
   └─ package.json
```

The route names above are a compact single-event implementation of the routes in `architecture.md`. If the team later supports multiple events, move buyer pages under `/events/[eventId]` and retain the same screen/state behavior. Do not mix two route schemes during the hackathon.

### Bringing in the template

1. Obtain the [ForumX repository](https://github.com/jonathanrao99/ForumX-Conference-Template) as a ZIP or use GitHub's template action. Import its app files into `web/` in this existing repository so the planning files remain in place. Avoid an embedded second `.git` directory.
2. In `web/`, run `npm install`, then `npm run dev`. Confirm the original landing page renders before modifying it.
3. Replace the ForumX content and navigation first. Then add the buyer flow and database integration in the [phase order](phases/README.md).
4. Keep a copy of the template's MIT license notice when distributing adapted code. Check the rights and attribution for any replacement image or other third-party asset.

The template's `package.json` already includes Next.js, React, Tailwind, Framer Motion, and Lucide icons. Add the Supabase/PostgreSQL client, validation, charting, and test dependencies only when their phases need them. Use versions compatible with the imported project rather than adding a second framework.

### Environment values

Create `web/.env.example` with names and explanations, without secrets:

```text
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=        # server only; never NEXT_PUBLIC_
SESSION_SECRET=                   # signs demo account session cookies
ADMIN_SECRET=                     # demo organizer access
```

If a different database connection method is chosen, document its own variable instead. The browser receives only public event data and session-safe responses. Server credentials must stay inside Route Handlers/server code.

## 3. Visual direction for Fair Drop

### Design language

Use ForumX's energetic event aesthetic on the landing page, then a calmer, information-first layout for queue and checkout screens.

| Element | Direction |
|---|---|
| Primary | ForumX blue `#2563eb` for the main action, current stage, and links |
| Ink | Deep slate/near-black for headings and dependable contrast |
| Canvas | White or light gray for status and admin screens |
| Success | Green with a text label for confirmed/healthy states |
| Warning | Amber with a text label for expiring holds or throttling |
| Error | Red with a text label for expired, rejected, or failed actions |
| Typography | Preserve the template's strong display type for the event name; use simpler body type and tabular numerals for timers and counters |
| Motion | Small fades or slides around status changes; no continuous animation that competes with the queue status |

Do not use color alone to convey state. A buyer must be able to read **Queued**, **Admitted**, **Reservation expires in…**, **Confirmed**, or **Sold out** plainly. Avoid fake urgency or a progress percentage before a randomized queue position exists.

### Event landing page layout

```text
Sticky header:  Fair Drop | Event | How it works | FAQ | My status | [Join waiting room]

ForumX image hero
  Event name and date
  “500 seats. One fair entry per eligible account.”
  Countdown to entry opening/closing (from server event time)
  Primary state-aware action: Join / View my status / Sale closed

One ticket card
  Price or “Demo ticket”; quantity limit; reservation duration
  Available inventory or sale state from the server

How the queue works
  1. Join during the published entry window
  2. One entry per account; order assigned when entry closes
  3. Admission in batches; short ticket hold to complete checkout

FAQ and final CTA
```

The hero CTA and nav CTA must run through one shared `getBuyerAction(eventState, buyerState)` mapping so they never disagree. A buyer who has joined should see **View my status**, not another join prompt. If the sale is closed, show a clear inactive state and reason.

### Queue screen layout

```text
Compact persistent header: Fair Drop | Event details | Help
Stage rail: Entry accepted → Position assigned → Admitted → Held → Confirmed
Main status card: current state, position/people ahead when known, last updated time
Plain-language queue rule and “refreshing will preserve your entry” note
```

On first load and after refresh, request the authoritative `/me` state. During the entry window say **Entry accepted; queue positions will be assigned when the window closes**. After ordering, show position and people ahead. Do not promise an exact wait time. During an API outage, keep the last known state visible with a **Reconnecting…** indicator; do not reset the buyer to the landing page.

### Checkout and confirmation

On admission, show one **Reserve one ticket** action. Once reserved, show a large timer based on the server-provided expiry time, one simulated checkout button, and clear expiry guidance. The browser timer is display only; server confirmation decides whether the hold is still valid. Confirmation shows the order ID and a **Demo purchase confirmed** label. No fake payment card or live-payment claim is needed.

### Organizer and Fairness Lab

Use the same brand colors and typography, with a denser layout. The first row should show **Available / Reserved / Sold / Queued / Admitted**. Put event controls next to current state, and show an audit/rejection table below. The Lab should show simulation settings beside the resulting ordinary-versus-retry/flood allocation table. A chart is optional; data labels and denominators are essential.

## 4. Navigation model — smooth and state-safe

### Information architecture

| Context | Navigation shown | Main action |
|---|---|---|
| Event landing | Event, How it works, FAQ, My status | Join waiting room or View my status |
| Queued | Event details, Help | No competing CTA; status is primary |
| Admitted | Event details, Help | Reserve one ticket |
| Reserved | Event details, Help | Confirm demo purchase |
| Confirmed | Event details, My ticket | View confirmation |
| Admin | Overview, Fairness Lab, Event setup | Sale controls, separate from buyer nav |

Keep admin navigation separate from the public header. Remove ForumX's Conference, Authors, Attend, and Sponsors dropdowns. The queue/checkout header must **remain visible**; do not carry the landing page's auto-hide-on-scroll behavior into time-sensitive buyer screens.

### Interaction requirements

1. Use Next.js `Link` for route transitions. Render anchor links only for sections that exist on the current landing page. Do not leave dead `/#...` links.
2. Smooth-scroll only for in-page sections. Add `scroll-margin-top` around 80–96 px so the fixed header does not cover section headings. Honor `prefers-reduced-motion` by disabling scroll and reveal animations for those users.
3. The mobile menu closes after a link is selected, on Escape, and when changing routes. Its toggle exposes `aria-expanded` and `aria-controls`; focus returns to the toggle when the menu closes. Keep menu controls keyboard reachable.
4. Show a short route loading state or skeleton for queue/checkout transitions, then read `/me` before displaying a final state. Never animate a buyer into **Admitted** or **Confirmed** until the server response confirms it.
5. Preserve queue state on Back, refresh, and reconnect. Routing may change what is displayed; it must not create a second queue entry or discard a reservation.
6. Disable repeat submits while an action is pending for clarity, and still use server idempotency for correctness. On an uncertain network result, query `/me` before inviting another purchase attempt.
7. Show a visible focus indicator, adequate contrast, and an `aria-live="polite"` region for important state changes. Use `role="alert"` for blocking errors such as expired reservation.
8. Treat all countdowns as views of server timestamps. Re-read state when a timer reaches zero or the tab becomes active; do not change trusted sale state locally.

### Navigation behavior by event state

| Server state | Hero/nav action | Destination/behavior |
|---|---|---|
| Entry not open | View countdown | Stay on event page; no premature join |
| Entry open, account not joined | Join waiting room | `POST /join`, then `/queue` on success |
| Account queued or admitted | View my status | `/queue`, which reloads `/me` |
| Account reserved | Continue checkout | `/checkout`, which reloads `/me` |
| Account confirmed | View my ticket | `/confirmation`, which reloads `/me` |
| Sold out or closed, no order | Sale status | Show clear terminal status; no active purchase CTA |

This mapping should live in one small shared helper and be covered by focused tests if practical. The server remains the source for all buyer states.

## 5. New Fair Drop UI components to build

These do not exist in ForumX and should be small, reusable components in `src/components/fairdrop/`.

| Component | Inputs | Rule |
|---|---|---|
| `SaleCountdown` | Server timestamps, current event state | Time display only; do not decide when sale opens |
| `QueueStatusCard` | Authoritative buyer state, position, update time | Handle pre-order, queued, admitted, sold-out, and reconnecting states |
| `StageRail` | Buyer state | Text labels alongside icons; no invented progress percentage |
| `ReservationTimer` | Server expiry timestamp | On zero, re-query server before showing expiry |
| `TicketSummary` | Event and ticket policy | One type, one-ticket maximum, actual/demo price |
| `StatusNotice` | Reason code, message, retry time | Clear duplicate/throttled/expired/sold-out explanations |
| `MetricCard` | Count and label | Tabular digits and source timestamp |
| `AuditTable` | Recent safe audit events | No tokens or private credentials |
| `FairnessResultsTable` | Run settings and cohort results | Show eligible-account denominators and request counts |
| `FairnessReceipt` | Buyer's recorded events | Explain outcome without implying a queue position guaranteed a ticket |

Use the API contracts and database state transitions in `architecture.md`. The UI never sends a queue position, inventory count, or trusted account ID as an authority.

## 6. Content checklist

Replace every placeholder with the actual demo facts, or use neutral demo labels until the team chooses them:

- Event name, event image, event date/time and timezone.
- Entry window opens/closes, sale starts, one-account/one-ticket rule, reservation duration.
- Ticket label and price: actual demo price or explicitly **Simulated checkout**.
- Published ordering method: eligible entries randomized **once** at entry close; state what happens to late arrivals.
- Queue FAQ: Can I refresh? What happens if I retry? When is my place assigned? Does a place guarantee a ticket? What happens if a hold expires?
- Footer contact and privacy text appropriate to a demo. Remove unsupported claims and old ForumX social links.
- SEO title, description, canonical URL, structured data, sitemap, and Open Graph image. Do not leave ForumX 2027/San Francisco values in metadata.

## 7. Build order and acceptance checks

| Step | Work | Acceptance check |
|---|---|---|
| 1 | Import ForumX and make its original page run | `npm run dev` opens the template; `npm run build` passes |
| 2 | Rebrand landing, simplify nav, remove old conference pages/links | Every visible link has a real destination; no ForumX placeholders remain |
| 3 | Build state-aware landing and queue page | Join/view-status CTA matches server state; refresh preserves entry |
| 4 | Add admission, reservation, checkout, confirmation | Navigating or reloading never changes the authoritative allocation |
| 5 | Add admin and Fairness Lab surfaces | Counts and test results are labeled and match server data |
| 6 | Polish motion and mobile behavior | Keyboard/mobile nav works; reduced-motion path works; no hidden CTA or covered anchor |

### Five-minute navigation QA

- On desktop, click every header link and final CTA; verify destination and fixed-header offset.
- On mobile, open the menu, select each link, then test Escape and browser Back.
- Join, refresh `/queue`, navigate to Event and back; confirm the same entry ID and position.
- Reserve, navigate away and back; confirm the same hold and server expiry.
- Submit confirmation twice or retry after a network interruption; confirm one order.
- Test a closed sale and an expired hold; no stale **Join** or **Confirm** CTA should appear.

## 8. References and boundary

- [ForumX source and README](https://github.com/jonathanrao99/ForumX-Conference-Template) — template structure, stack, and MIT license.
- [ForumX `package.json`](https://github.com/jonathanrao99/ForumX-Conference-Template/blob/main/package.json) — current dependencies and scripts.
- [Next.js Route Handlers](https://nextjs.org/docs/app/guides/backend-for-frontend) — buyer/organizer API layer.
- [Supabase Database Functions](https://supabase.com/docs/guides/database/functions) — transaction-backed critical transitions.

The ForumX template supplies presentation, not Fair Drop's fairness guarantees. The queue, admission, inventory integrity, idempotency, simulator, and measured claims must be implemented and verified as described in [architecture.md](architecture.md).
