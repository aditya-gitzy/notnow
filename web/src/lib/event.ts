import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { expireEventHolds } from "./checkout";
import { protectedAccount } from "./protected-sale";
import { consumeDemoChallenge } from "./demo-challenge";
import type { DemoPolicy } from "./demo-policy";

export type EventRow = {
  id: string;
  name: string;
  status: "DRAFT" | "ENTRY_OPEN" | "ENTRY_CLOSED" | "SELLING" | "SOLD_OUT" | "CLOSED";
  entry_opens_at: string;
  entry_closes_at: string;
  total_inventory: number;
  available: number;
  reserved: number;
  sold: number;
  batch_size: number;
  reservation_ttl_seconds: number;
  admission_ttl_seconds: number;
  queue_policy_version: string;
  access_mode: "DEMO" | "PROTECTED";
  is_listed: boolean;
  event_starts_at: string | null;
  venue: string | null;
  image_url: string | null;
  simulation_run_id: string | null;
  ordering_cutoff_at: string | null;
  ordered_at: string | null;
  ordered_count: number | null;
};

export type QueueEntry = {
  id: string;
  event_id: string;
  account_id: string;
  received_at: string;
  position: number | null;
  state: string;
  admitted_at: string | null;
  admission_expires_at: string | null;
};

type BuyerSnapshotRow = {
  account_id: string; display_name: string; auth_kind: string;
  entry_id: string | null; received_at: string | null; position: number | null; entry_state: string | null;
  admitted_at: string | null; admission_expires_at: string | null;
  reservation_id: string | null; expires_at: string | null;
  order_id: string | null; confirmed_at: string | null;
  expired_hold: boolean; reasons: string[];
};

export type BuyerState = {
  state: string;
  account: { id: string; displayName: string } | null;
  entry: { id: string; receivedAt: string; position: number | null; admittedAt: string | null; admissionExpiresAt: string | null } | null;
  peopleAhead: number | null;
  reservation: { id: string; expiresAt: string } | null;
  order: { id: string; confirmedAt: string } | null;
  receipt: { acceptedAt: string; policyVersion: string; cutoffAt: string | null; finalPosition: number | null;
    admittedAt: string | null; admissionOutcome: string; purchaseOutcome: string; reasonCodes: string[] } | null;
  reasonCode: string | null;
  message: string;
};

export async function getEvent(id: string): Promise<EventRow | null> {
  const db = await getDb();
  const { rows } = await db.query<EventRow>("SELECT * FROM events WHERE id = $1", [id]);
  const row = rows[0];
  return row ? normalizeEvent(row) : null;
}

function normalizeEvent(row: EventRow): EventRow {
  return {
    ...row,
    entry_opens_at: new Date(row.entry_opens_at).toISOString(),
    entry_closes_at: new Date(row.entry_closes_at).toISOString(),
    event_starts_at: row.event_starts_at ? new Date(row.event_starts_at).toISOString() : null,
    ordering_cutoff_at: row.ordering_cutoff_at ? new Date(row.ordering_cutoff_at).toISOString() : null,
    ordered_at: row.ordered_at ? new Date(row.ordered_at).toISOString() : null,
  };
}

// Public catalog excludes attack runs and old reset fixtures. The active demo
// remains visible so judges can still try it alongside organiser events.
export async function listPublicEvents(): Promise<EventRow[]> {
  const db = await getDb();
  const { rows } = await db.query<EventRow>(
    `SELECT * FROM events WHERE simulation_run_id IS NULL AND access_mode='DEMO'
       AND (is_listed OR id=(SELECT event_id FROM demo_current_event WHERE singleton=true))
     ORDER BY CASE WHEN status='ENTRY_OPEN' THEN 0 WHEN status='DRAFT' THEN 1 ELSE 2 END,
       entry_closes_at ASC,created_at DESC LIMIT 100`,
  );
  return rows.map(normalizeEvent);
}

export async function getDemoAccounts() {
  const db = await getDb();
  const { rows } = await db.query<{ id: string; display_name: string }>(
    "SELECT id, display_name FROM demo_accounts WHERE role = 'buyer' AND auth_kind='DEMO' ORDER BY display_name",
  );
  return rows.map((row) => ({ id: row.id, displayName: row.display_name }));
}

export async function getBuyerState(eventId: string, accountId: string | null, knownEvent?: EventRow): Promise<BuyerState> {
  const event = knownEvent ?? await getEvent(eventId);
  const signInMessage = event?.access_mode === "PROTECTED" ? "Claim an invitation or sign in to join." : "Sign in to join the drop.";
  if (!accountId) return { state: "NOT_SIGNED_IN", account: null, entry: null, peopleAhead: null, reservation: null, order: null, receipt: null, reasonCode: null, message: signInMessage };
  const access = event?.access_mode === "PROTECTED" ? await protectedAccount(eventId, accountId) : null;
  if (event?.access_mode === "PROTECTED" && !access) return { state: "NOT_SIGNED_IN", account: null, entry: null, peopleAhead: null, reservation: null, order: null, receipt: null, reasonCode: null, message: signInMessage };
  const db = await getDb();
  const readSnapshot = async () => (await db.query<BuyerSnapshotRow>(
    `SELECT a.id AS account_id,a.display_name,a.auth_kind,
       q.id AS entry_id,q.received_at,q.position,q.state AS entry_state,q.admitted_at,q.admission_expires_at,
       r.id AS reservation_id,r.expires_at,o.id AS order_id,o.confirmed_at,
       EXISTS (SELECT 1 FROM reservations x WHERE x.event_id=$1 AND x.account_id=$2 AND x.state='EXPIRED') AS expired_hold,
       ARRAY(SELECT h.reason_code FROM audit_events h WHERE h.event_id=$1 AND h.account_id=$2
         AND h.reason_code IS NOT NULL ORDER BY h.occurred_at DESC,h.id DESC LIMIT 12) AS reasons
     FROM demo_accounts a
     LEFT JOIN queue_entries q ON q.event_id=$1 AND q.account_id=a.id
     LEFT JOIN LATERAL (SELECT id,expires_at FROM reservations WHERE event_id=$1 AND account_id=a.id
       AND state='ACTIVE' ORDER BY created_at DESC LIMIT 1) r ON true
     LEFT JOIN orders o ON o.event_id=$1 AND o.account_id=a.id
     WHERE a.id=$2 AND a.role='buyer'`, [eventId, accountId],
  )).rows[0];
  let snapshot = await readSnapshot();
  if (!snapshot || (event?.access_mode === "DEMO" && !(event.simulation_run_id ? snapshot.auth_kind === "SIMULATION" : ["DEMO", "EMAIL_OTP"].includes(snapshot.auth_kind)))) return { state: "NOT_SIGNED_IN", account: null, entry: null, peopleAhead: null, reservation: null, order: null, receipt: null, reasonCode: null, message: signInMessage };
  if (snapshot.reservation_id && snapshot.expires_at && new Date(snapshot.expires_at).getTime() <= Date.now()) {
    await expireEventHolds(eventId);
    snapshot = await readSnapshot();
  }
  const account = { id: snapshot.account_id, display_name: snapshot.display_name };
  const entry = snapshot.entry_id ? { id: snapshot.entry_id, received_at: snapshot.received_at!, position: snapshot.position,
    state: snapshot.entry_state!, admitted_at: snapshot.admitted_at, admission_expires_at: snapshot.admission_expires_at } : null;
  const reservation = snapshot.reservation_id ? { id: snapshot.reservation_id, expires_at: snapshot.expires_at! } : null;
  const order = snapshot.order_id ? { id: snapshot.order_id, confirmed_at: snapshot.confirmed_at! } : null;
  const expiredHold = snapshot.expired_hold;
  const reasons = snapshot.reasons ?? [];
  const admissionExpired = entry?.state === "ADMITTED" && entry.admission_expires_at && new Date(entry.admission_expires_at).getTime() <= Date.now();
  const state = access?.review_state === "BLOCKED" ? "BLOCKED" : access?.review_state === "REVIEW_REQUIRED" ? "REVIEW_REQUIRED"
    : order ? "CONFIRMED" : reservation ? "RESERVED" : admissionExpired ? "EXPIRED" : entry?.state ?? "NOT_JOINED";
  const ahead = entry?.position && state === "QUEUED" && (event?.ordered_count ?? 0) <= 1000 ? await db.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM queue_entries WHERE event_id = $1 AND position < $2 AND state = 'QUEUED'",
    [eventId, entry.position],
  ) : null;
  return {
    state,
    account: { id: account.id, displayName: account.display_name },
    entry: entry ? {
      id: entry.id, receivedAt: new Date(entry.received_at).toISOString(), position: entry.position,
      admittedAt: entry.admitted_at ? new Date(entry.admitted_at).toISOString() : null,
      admissionExpiresAt: entry.admission_expires_at ? new Date(entry.admission_expires_at).toISOString() : null,
    } : null,
    peopleAhead: ahead ? Number(ahead.rows[0]?.count ?? 0) : null,
    reservation: reservation ? { id: reservation.id, expiresAt: new Date(reservation.expires_at).toISOString() } : null,
    order: order ? { id: order.id, confirmedAt: new Date(order.confirmed_at).toISOString() } : null,
    receipt: entry && event ? {
      acceptedAt: new Date(entry.received_at).toISOString(), policyVersion: event.queue_policy_version,
      cutoffAt: event.ordering_cutoff_at ? new Date(event.ordering_cutoff_at).toISOString() : null,
      finalPosition: entry.position, admittedAt: entry.admitted_at ? new Date(entry.admitted_at).toISOString() : null,
      admissionOutcome: entry.admitted_at ? (entry.state === "EXPIRED" && !expiredHold ? "EXPIRED" : "ADMITTED") : "WAITING",
      purchaseOutcome: order ? "CONFIRMED" : reservation ? "HELD" : expiredHold ? "HOLD_EXPIRED" : "NOT_PURCHASED",
      reasonCodes: [...new Set(reasons)],
    } : null,
    reasonCode: access?.review_state === "BLOCKED" ? "ATTENDEE_BLOCKED" : access?.review_state === "REVIEW_REQUIRED" ? "REVIEW_REQUIRED" : admissionExpired ? "ADMISSION_EXPIRED" : null,
    message: access?.review_state === "BLOCKED" ? "Your attendee eligibility is blocked. Contact the organizer."
      : access?.review_state === "REVIEW_REQUIRED" ? "Your eligibility needs organizer review before joining or checkout."
      : order ? "Your demo purchase is confirmed."
      : reservation ? "One ticket is held for you. Confirm before the hold expires."
      : entry?.state === "EXPIRED" ? "Your reservation or admission expired."
      : admissionExpired ? "Your admission window expired before a ticket was reserved."
      : state === "ADMITTED" ? "You are admitted. Your admission window is open."
      : entry ? (entry.position ? "Your queue position is assigned." : "Entry accepted. Positions are assigned when entry closes.")
      : "Join during the entry window.",
  };
}

export async function joinQueue(eventId: string, accountId: string, challenge?: { challengeId?: unknown; answer?: unknown }) {
  const db = await getDb();
  const result = await db.transaction(async (tx) => {
    const event = (await tx.query<EventRow>("SELECT * FROM events WHERE id = $1 FOR UPDATE", [eventId])).rows[0];
    if (!event) return { ok: false, reasonCode: "EVENT_NOT_FOUND", message: "Event not found." };
    let personId: string | null = null;
    let identityKey: string | null = null;
    const policy = event.simulation_run_id ? (await tx.query<DemoPolicy>(
      "SELECT * FROM demo_run_policies WHERE event_id=$1", [eventId],
    )).rows[0] : null;
    if (event.access_mode === "PROTECTED") {
      const access = (await tx.query<{ person_id: string; review_state: string }>(
        `SELECT c.person_id,p.review_state FROM protected_credentials c JOIN protected_people p ON p.id=c.person_id
         WHERE c.event_id=$1 AND c.account_id=$2 FOR UPDATE`, [eventId, accountId],
      )).rows[0];
      if (!access) return { ok: false, reasonCode: "ELIGIBILITY_REQUIRED", message: "Claim an invitation and sign in before joining." };
      if (access.review_state !== "APPROVED") return { ok: false, reasonCode: access.review_state === "BLOCKED" ? "ATTENDEE_BLOCKED" : "REVIEW_REQUIRED", message: "Organizer review is required before joining." };
      personId = access.person_id;
      const otherEntry = (await tx.query<{ account_id: string }>(
        "SELECT account_id FROM queue_entries WHERE event_id=$1 AND person_id=$2", [eventId, personId],
      )).rows[0];
      if (otherEntry && otherEntry.account_id !== accountId) return { ok: false, reasonCode: "PERSON_ALREADY_ENTERED", message: "This attendee already has a queue entry." };
    } else {
      const demoAccount = (await tx.query<{ id: string }>(
        "SELECT id FROM demo_accounts WHERE id=$1 AND auth_kind=ANY($2::text[]) AND role='buyer'", [accountId, event.simulation_run_id ? ["SIMULATION"] : ["DEMO", "EMAIL_OTP"]],
      )).rows[0];
      if (!demoAccount) return { ok: false, reasonCode: "ATTENDEE_ACCOUNT_REQUIRED", message: "Sign in as an attendee for this sale." };
      if (policy) {
        const actor = (await tx.query<{ identity_key: string }>(
          "SELECT identity_key FROM demo_actors WHERE event_id=$1 AND account_id=$2", [eventId, accountId],
        )).rows[0];
        if (!actor) return { ok: false, reasonCode: "DEMO_ACTOR_REQUIRED", message: "This account is not part of the demo run." };
        identityKey = actor.identity_key;
      }
    }
    const existing = await tx.query<QueueEntry>(
      "SELECT * FROM queue_entries WHERE event_id = $1 AND account_id = $2", [eventId, accountId],
    );
    if (existing.rows[0]) {
      await tx.query(
        "INSERT INTO audit_events (id, event_id, account_id, type, reason_code) VALUES ($1, $2, $3, 'QUEUE_RESUME', 'ALREADY_JOINED')",
        [randomUUID(), eventId, accountId],
      );
      return { ok: true, reasonCode: "ALREADY_JOINED" };
    }
    const now = Date.now();
    if (event.status !== "ENTRY_OPEN" || now < new Date(event.entry_opens_at).getTime() || now >= new Date(event.entry_closes_at).getTime()) {
      return { ok: false, reasonCode: "ENTRY_CLOSED", message: "The entry window is not open." };
    }
    if (policy?.identity_limit_enabled && identityKey) {
      const duplicate = (await tx.query<{ id: string }>(
        "SELECT id FROM queue_entries WHERE event_id=$1 AND identity_key=$2 LIMIT 1", [eventId, identityKey],
      )).rows[0];
      if (duplicate) return { ok: false, reasonCode: "IDENTITY_ALREADY_ENTERED", message: "This simulated identity already has an entry." };
    }
    if (policy?.challenge_enabled) {
      const passed = await consumeDemoChallenge(tx, eventId, accountId, challenge?.challengeId, challenge?.answer);
      if (!passed.ok) return { ok: false, reasonCode: passed.reasonCode, message: "Complete the demo challenge before entering." };
    }
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO queue_entries (id, event_id, account_id, person_id, identity_key, state)
       VALUES ($1, $2, $3, $4, $5, 'QUEUED')
       ON CONFLICT (event_id, account_id) DO NOTHING RETURNING id`,
      [randomUUID(), eventId, accountId, personId, identityKey],
    );
    await tx.query(
      "INSERT INTO audit_events (id, event_id, account_id, type, reason_code) VALUES ($1, $2, $3, $4, $5)",
      [randomUUID(), eventId, accountId, inserted.rows[0] ? "QUEUE_JOIN" : "QUEUE_RESUME", inserted.rows[0] ? null : "ALREADY_JOINED"],
    );
    return { ok: true, reasonCode: inserted.rows[0] ? "JOINED" : "ALREADY_JOINED" };
  });
  return result.ok ? { ...result, buyer: await getBuyerState(eventId, accountId) } : result;
}
