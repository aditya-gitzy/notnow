import { getDb } from "./db";
import { getDemoPolicy } from "./demo-policy";

export async function demoAttackTimeline(eventId: string) {
  const db = await getDb();
  const timelineRows = (await db.query<{ second: string; humans: string; bots: string; blocked: string }>(
    `SELECT floor(extract(epoch FROM h.occurred_at))::bigint::text AS second,
       count(*) FILTER (WHERE h.type='QUEUE_JOIN' AND a.kind='HUMAN')::text AS humans,
       count(*) FILTER (WHERE h.type='QUEUE_JOIN' AND a.kind='BOT')::text AS bots,
       count(*) FILTER (WHERE h.type IN ('REQUEST_THROTTLED','REQUEST_REJECTED'))::text AS blocked
     FROM audit_events h LEFT JOIN demo_actors a ON a.event_id=h.event_id AND a.account_id=h.account_id
     WHERE h.event_id=$1 AND h.type IN ('QUEUE_JOIN','REQUEST_THROTTLED','REQUEST_REJECTED')
     GROUP BY floor(extract(epoch FROM h.occurred_at)) ORDER BY floor(extract(epoch FROM h.occurred_at))`, [eventId],
  )).rows;
  // Rebuild the chart from audit events after a refresh. Live polling uses
  // exact counter snapshots and does not repeat this grouping every second.
  let humanCount = 0, botCount = 0, blockedCount = 0;
  const allPoints = timelineRows.map((row) => {
    humanCount += Number(row.humans); botCount += Number(row.bots); blockedCount += Number(row.blocked);
    return { at: new Date(Number(row.second) * 1000).toISOString(), humanEntries: humanCount,
      botEntries: botCount, blockedRequests: blockedCount };
  });
  const step = Math.max(1, Math.ceil(allPoints.length / 120));
  return allPoints.filter((_, index) => index % step === 0 || index === allPoints.length - 1);
}

export async function demoAttackMetrics(eventId: string, includeTimeline = true) {
  const policy = await getDemoPolicy(eventId);
  if (!policy) return null;
  const db = await getDb();
  // One SQL statement gives all counters the same database snapshot. This
  // keeps integrity badges stable even while seats are being allocated.
  const [snapshotResult, feedResult, timeline] = await Promise.all([
    db.query<{ total_inventory: number; available: number; reserved: number; sold: number;
      total_entries: string; human_entries: string; bot_entries: string; allocated: string;
      bot_seats: string; duplicate: string; blocked: string }>(
      `SELECT e.total_inventory,e.available,e.reserved,e.sold,
         q.total_entries,q.human_entries,q.bot_entries,
         seats.allocated,seats.bot_seats,seats.duplicate,blocked.blocked
       FROM events e
       CROSS JOIN LATERAL (
         SELECT count(*)::text AS total_entries,
           count(*) FILTER (WHERE a.kind='HUMAN')::text AS human_entries,
           count(*) FILTER (WHERE a.kind='BOT')::text AS bot_entries
         FROM queue_entries q JOIN demo_actors a ON a.event_id=q.event_id AND a.account_id=q.account_id
         WHERE q.event_id=e.id
       ) q
       CROSS JOIN LATERAL (
         SELECT count(*)::text AS allocated,
           count(*) FILTER (WHERE a.kind='BOT')::text AS bot_seats,
           (SELECT coalesce(sum(n-1),0)::text FROM (
             SELECT count(*) AS n FROM reservations WHERE event_id=e.id AND seat_no IS NOT NULL
               AND state IN ('ACTIVE','CONFIRMED') GROUP BY seat_no HAVING count(*)>1
           ) d) AS duplicate
         FROM reservations r JOIN demo_actors a ON a.event_id=r.event_id AND a.account_id=r.account_id
         WHERE r.event_id=e.id AND r.state IN ('ACTIVE','CONFIRMED')
       ) seats
       CROSS JOIN LATERAL (
         SELECT count(*)::text AS blocked FROM audit_events
         WHERE event_id=e.id AND type IN ('REQUEST_THROTTLED','REQUEST_REJECTED')
       ) blocked
       WHERE e.id=$1`, [eventId],
    ),
    db.query<{ id: string; type: string; reason_code: string | null; occurred_at: string; kind: string | null }>(
      `SELECT h.id,h.type,h.reason_code,h.occurred_at,a.kind FROM audit_events h
       LEFT JOIN demo_actors a ON a.event_id=h.event_id AND a.account_id=h.account_id
       WHERE h.event_id=$1 AND h.type IN ('REQUEST_THROTTLED','REQUEST_REJECTED','QUEUE_JOIN','SEAT_ALLOCATED')
       ORDER BY h.occurred_at DESC,h.id DESC LIMIT 30`, [eventId],
    ),
    includeTimeline ? demoAttackTimeline(eventId) : Promise.resolve([]),
  ]);
  const snapshot = snapshotResult.rows[0];
  if (!snapshot) return null;
  const feed = feedResult.rows;
  const totalEntries = Number(snapshot.total_entries);
  const botEntries = Number(snapshot.bot_entries);
  const allocated = Number(snapshot.allocated);
  const botSeats = Number(snapshot.bot_seats);
  return {
    eventId, policy, totalEntries, humanEntries: Number(snapshot.human_entries), botEntries,
    blockedRequests: Number(snapshot.blocked), seatsRemaining: snapshot.available,
    seatsAllocated: allocated, seatsWonByBots: botSeats, confirmedSeats: snapshot.sold,
    botEntryShare: totalEntries ? botEntries / totalEntries : 0,
    botSeatShare: allocated ? botSeats / allocated : 0,
    oversold: Math.max(0, snapshot.reserved + snapshot.sold - snapshot.total_inventory, allocated - snapshot.total_inventory),
    duplicateAllocations: Number(snapshot.duplicate),
    inventoryBalanced: snapshot.available + snapshot.reserved + snapshot.sold === snapshot.total_inventory,
    liveSeatsMatchInventory: allocated === snapshot.reserved + snapshot.sold,
    timeline,
    feed: feed.map((row) => ({ id: row.id, type: row.type, reasonCode: row.reason_code, kind: row.kind,
      occurredAt: new Date(row.occurred_at).toISOString() })),
    serverTime: new Date().toISOString(),
  };
}
