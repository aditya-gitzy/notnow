import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const dir = process.env.PGLITE_DATA_DIR;
if (!dir) throw new Error("Set PGLITE_DATA_DIR to an isolated test directory");
const db = new PGlite(dir);
try {
  await db.exec(await readFile("db/schema.sql", "utf8"));
  const fixtures = {};
  for (const [label, defended] of [["defended", true], ["baseline", false]]) {
    const runId = randomUUID();
    const eventId = randomUUID();
    await db.query("INSERT INTO simulation_runs (id,seed,config) VALUES ($1,'backend-smoke',$2::jsonb)",
      [runId, JSON.stringify({ label })]);
    await db.query(`INSERT INTO events (id,name,status,entry_opens_at,entry_closes_at,total_inventory,available,
      reserved,sold,batch_size,reservation_ttl_seconds,simulation_run_id,queue_policy_version)
      VALUES ($1,$2,'ENTRY_OPEN',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',
      2,2,0,0,2,300,$3,$4)`,
    [eventId, `Backend ${label}`, runId, defended ? "demo-seeded-random-v1" : "demo-first-come-v1"]);
    await db.query("UPDATE simulation_runs SET event_id=$1 WHERE id=$2", [eventId, runId]);
    await db.query(`INSERT INTO demo_run_policies (event_id,run_id,rate_limit_enabled,identity_limit_enabled,challenge_enabled,allocation_mode)
      VALUES ($1,$2,$3,$3,$3,$4)`, [eventId, runId, defended, defended ? "RANDOM" : "FIRST_COME"]);
    const accounts = [];
    for (let index = 0; index < 4; index++) {
      const accountId = randomUUID();
      const kind = index === 0 || index === 3 ? "HUMAN" : "BOT";
      const identity = index === 2 ? "bot-shared" : index === 1 ? "bot-shared" : `human-${index}`;
      await db.query("INSERT INTO demo_accounts (id,display_name,auth_kind,simulation_index) VALUES ($1,$2,'SIMULATION',$3)",
        [accountId, `${label}-${index}-${runId.slice(0, 6)}`, index]);
      await db.query("INSERT INTO demo_actors (event_id,account_id,identity_key,kind) VALUES ($1,$2,$3,$4)",
        [eventId, accountId, identity, kind]);
      accounts.push(accountId);
    }
    fixtures[label] = { eventId, accounts };
  }
  console.log(JSON.stringify(fixtures));
} finally { await db.close(); }
