import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";

const dir = process.env.PGLITE_DATA_DIR;
const eventId = process.env.ATTACK_EVENT_ID;
if (!dir || !eventId) throw new Error("Set isolated PGLITE_DATA_DIR and ATTACK_EVENT_ID");
const db = new PGlite(dir);
try {
  const rows = (await db.query(`SELECT q.position,q.state,r.seat_no FROM queue_entries q
    LEFT JOIN reservations r ON r.queue_entry_id=q.id AND r.state='ACTIVE'
    WHERE q.event_id=$1 ORDER BY q.position`, [eventId])).rows;
  assert.deepEqual(rows.map((row) => row.position), [1, 2, 3]);
  assert.equal(rows[2].state, "RESERVED");
  assert.equal(rows[2].seat_no, 1);
  const expired = (await db.query("SELECT count(*)::int AS count FROM reservations WHERE event_id=$1 AND state='EXPIRED' AND seat_no=1", [eventId])).rows[0].count;
  assert.equal(expired, 1);
  console.log(JSON.stringify({ positionThreeReceivedFreedSeatOne: true, expiredHoldCount: expired }));
} finally { await db.close(); }
