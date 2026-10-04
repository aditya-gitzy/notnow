import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { getEvent } from "./event";
import type { AttackConfig } from "./attack-config";

export type AttackRunRow = {
  id: string; source_event_id: string | null; event_id: string | null;
  seed: string; config: AttackConfig & { kind: string }; status: string;
  started_at: string; completed_at: string | null; results: unknown;
};

export async function createAttackRun(sourceEventId: string, config: AttackConfig) {
  const source = await getEvent(sourceEventId);
  if (!source) return { ok: false, reasonCode: "EVENT_NOT_FOUND" };
  const db = await getDb();
  const runId = randomUUID();
  const eventId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.query(`INSERT INTO simulation_runs (id,source_event_id,seed,config,status)
      VALUES ($1,$2,$3,$4::jsonb,'READY')`, [runId, sourceEventId, config.seed, JSON.stringify({ kind: "ATTACK_DEMO", ...config })]);
    await tx.query(`INSERT INTO events (id,name,status,entry_opens_at,entry_closes_at,
      total_inventory,available,reserved,sold,batch_size,reservation_ttl_seconds,simulation_run_id,queue_policy_version)
      VALUES ($1,$2,'ENTRY_OPEN',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '30 minutes',
      $3,$3,0,0,$3,300,$4,$5)`, [eventId, `Attack demo ${runId.slice(0, 8)}`, config.seats, runId,
      config.defenses.allocation_mode === "RANDOM" ? "demo-seeded-random-v1" : "demo-first-come-v1"]);
    await tx.query("UPDATE simulation_runs SET event_id=$1 WHERE id=$2", [eventId, runId]);
    await tx.query(`INSERT INTO demo_run_policies (event_id,run_id,rate_limit_enabled,identity_limit_enabled,challenge_enabled,allocation_mode)
      VALUES ($1,$2,$3,$4,$5,$6)`, [eventId, runId, config.defenses.rate_limit_enabled,
      config.defenses.identity_limit_enabled, config.defenses.challenge_enabled, config.defenses.allocation_mode]);
    // Set-based inserts are much faster than one query per actor. These are
    // trusted simulation identities, not accounts verified in the real world.
    await tx.query(`INSERT INTO demo_accounts (id,display_name,auth_kind,simulation_index)
      SELECT $1||':bot:'||n, 'Attack '||left($1,8)||' bot '||n,'SIMULATION',n
      FROM generate_series(0,$2::integer-1) AS n`, [runId, config.bots]);
    await tx.query(`INSERT INTO demo_accounts (id,display_name,auth_kind,simulation_index)
      SELECT $1||':human:'||n, 'Attack '||left($1,8)||' human '||n,'SIMULATION',$2::integer+n
      FROM generate_series(0,$3::integer-1) AS n`, [runId, config.bots, config.humans]);
    await tx.query(`INSERT INTO demo_actors (event_id,account_id,identity_key,kind)
      SELECT $1,$2||':bot:'||n,'bot-'||(n % $3::integer),'BOT'
      FROM generate_series(0,$4::integer-1) AS n`, [eventId, runId, config.fakeIdentities, config.bots]);
    await tx.query(`INSERT INTO demo_actors (event_id,account_id,identity_key,kind)
      SELECT $1,$2||':human:'||n,'human-'||n,'HUMAN'
      FROM generate_series(0,$3::integer-1) AS n`, [eventId, runId, config.humans]);
  });
  return { ok: true, runId, eventId, status: "READY" };
}

export async function getAttackRun(eventId: string) {
  const db = await getDb();
  const row = (await db.query<AttackRunRow>(
    "SELECT * FROM simulation_runs WHERE event_id=$1 AND config->>'kind'='ATTACK_DEMO'", [eventId],
  )).rows[0];
  if (!row) return null;
  return { id: row.id, eventId: row.event_id, sourceEventId: row.source_event_id,
    seed: row.seed, config: row.config, status: row.status,
    startedAt: new Date(row.started_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    results: row.results };
}

export async function getAttackHistory(sourceEventId: string) {
  const db = await getDb();
  const rows = (await db.query<AttackRunRow>(`SELECT * FROM simulation_runs
    WHERE source_event_id=$1 AND config->>'kind'='ATTACK_DEMO'
    ORDER BY started_at DESC LIMIT 50`, [sourceEventId])).rows;
  return rows.map((row) => ({ id: row.id, eventId: row.event_id, seed: row.seed,
    config: row.config, status: row.status, startedAt: new Date(row.started_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    results: row.results }));
}

export async function resetAttackRun(eventId: string) {
  const current = await getAttackRun(eventId);
  if (!current) return { ok: false, reasonCode: "ATTACK_RUN_NOT_FOUND" };
  if (current.status === "RUNNING") return { ok: false, reasonCode: "RUN_IN_PROGRESS" };
  if (!current.sourceEventId) return { ok: false, reasonCode: "SOURCE_EVENT_NOT_FOUND" };
  // A fresh event has empty entries, seats and counters. The old event stays
  // intact so the results comparison can still show what really happened.
  return createAttackRun(current.sourceEventId, current.config);
}
