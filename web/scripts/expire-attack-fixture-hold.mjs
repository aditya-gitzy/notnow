import { PGlite } from "@electric-sql/pglite";

const dir = process.env.PGLITE_DATA_DIR;
const eventId = process.env.ATTACK_EVENT_ID;
if (!dir || !eventId) throw new Error("Set isolated PGLITE_DATA_DIR and ATTACK_EVENT_ID");
const db = new PGlite(dir);
try {
  const expired = (await db.query(`UPDATE reservations SET expires_at=clock_timestamp()-interval '1 second'
    WHERE id=(SELECT id FROM reservations WHERE event_id=$1 AND state='ACTIVE' ORDER BY seat_no LIMIT 1)
    RETURNING id,seat_no`, [eventId])).rows[0];
  if (!expired) throw new Error("No active demo hold found");
  console.log(JSON.stringify({ eventId, reservationId: expired.id, seatNo: expired.seat_no }));
} finally { await db.close(); }
