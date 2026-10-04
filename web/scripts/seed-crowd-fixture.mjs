import { PGlite } from "@electric-sql/pglite";

const count = Number(process.env.CROWD_ACCOUNTS ?? 50_000);
if (!Number.isInteger(count) || count < 1 || count > 50_000) throw new Error("CROWD_ACCOUNTS must be 1–50000");
const db = new PGlite(process.env.PGLITE_DATA_DIR ?? ".data/pglite");
try {
  const eventId = (await db.query("SELECT event_id FROM demo_current_event WHERE singleton=true")).rows[0]?.event_id;
  if (!eventId) throw new Error("Start the app once to initialize the isolated database, then stop it before seeding");
  await db.query(`INSERT INTO demo_accounts (id,display_name,role,auth_kind)
    SELECT 'crowd-'||n, 'Crowd Buyer '||n, 'buyer', 'DEMO' FROM generate_series(1,$1::integer) AS n
    ON CONFLICT (id) DO NOTHING`, [count]);
  await db.query(`INSERT INTO queue_entries (id,event_id,account_id,state)
    SELECT 'crowd-entry-'||n,$1,'crowd-'||n,'QUEUED' FROM generate_series(1,$2::integer) AS n
    ON CONFLICT (event_id,account_id) DO NOTHING`, [eventId, count]);
  const queued = (await db.query("SELECT count(*)::int AS count FROM queue_entries WHERE event_id=$1", [eventId])).rows[0].count;
  console.log(JSON.stringify({ eventId, queued }));
} finally { await db.close(); }
