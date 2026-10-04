import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { expireDueHolds } from "./checkout";

export async function allocateDemoSeats(eventId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    // Every allocation, confirmation and expiry locks this event first. That
    // serializes stock changes even when many HTTP requests arrive together.
    const event = (await tx.query<{ status: string; simulation_run_id: string | null; total_inventory: number; reservation_ttl_seconds: number }>(
      "SELECT status,simulation_run_id,total_inventory,reservation_ttl_seconds FROM events WHERE id=$1 FOR UPDATE", [eventId],
    )).rows[0];
    const policy = (await tx.query<{ event_id: string }>("SELECT event_id FROM demo_run_policies WHERE event_id=$1", [eventId])).rows[0];
    if (!event?.simulation_run_id || !policy) return { ok: false, reasonCode: "DEMO_RUN_REQUIRED" };
    if (event.status !== "SELLING") return { ok: false, reasonCode: "SALE_NOT_ACTIVE" };
    await expireDueHolds(eventId, tx);
    const stock = (await tx.query<{ available: number }>("SELECT available FROM events WHERE id=$1", [eventId])).rows[0];
    if (stock.available === 0) return { ok: true, reasonCode: "NO_SEATS_AVAILABLE", allocated: 0 };
    const winners = (await tx.query<{ id: string; account_id: string; person_id: string | null; position: number }>(
      `SELECT id,account_id,person_id,position FROM queue_entries
       WHERE event_id=$1 AND state='QUEUED' AND position IS NOT NULL
       ORDER BY position LIMIT $2 FOR UPDATE`, [eventId, stock.available],
    )).rows;
    const freeSeats = (await tx.query<{ seat_no: number }>(
      `SELECT seat AS seat_no FROM generate_series(1,$2::integer) AS seat
       WHERE NOT EXISTS (SELECT 1 FROM reservations r WHERE r.event_id=$1 AND r.seat_no=seat
         AND r.state IN ('ACTIVE','CONFIRMED')) ORDER BY seat LIMIT $3`,
      [eventId, event.total_inventory, winners.length],
    )).rows;
    if (freeSeats.length < winners.length) throw new Error("Inventory and live seat assignments disagree");
    for (const [index, winner] of winners.entries()) {
      const reservationId = randomUUID();
      const held = (await tx.query<{ expires_at: string }>(
        `INSERT INTO reservations (id,event_id,account_id,person_id,queue_entry_id,seat_no,state,expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE',clock_timestamp()+$7::integer*interval '1 second') RETURNING expires_at`,
        [reservationId, eventId, winner.account_id, winner.person_id, winner.id, freeSeats[index].seat_no,
          event.reservation_ttl_seconds],
      )).rows[0];
      await tx.query(`UPDATE queue_entries SET state='RESERVED',admitted_at=clock_timestamp(),
        admission_expires_at=$2 WHERE id=$1`, [winner.id, held.expires_at]);
      await tx.query(`INSERT INTO audit_events (id,event_id,account_id,type,metadata)
        VALUES ($1,$2,$3,'SEAT_ALLOCATED',$4::jsonb)`,
      [randomUUID(), eventId, winner.account_id, JSON.stringify({ seatNo: freeSeats[index].seat_no, position: winner.position })]);
    }
    await tx.query("UPDATE events SET available=available-$2,reserved=reserved+$2 WHERE id=$1", [eventId, winners.length]);
    return { ok: true, reasonCode: winners.length ? "SEATS_ALLOCATED" : "QUEUE_EMPTY", allocated: winners.length,
      remainingQueued: Number((await tx.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM queue_entries WHERE event_id=$1 AND state='QUEUED'", [eventId],
      )).rows[0].count) };
  });
}
