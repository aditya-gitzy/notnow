import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { getDb } from "./db";
import { buyerCookieHeader, organizerCookieHeader } from "./session";
import { botAttempts } from "./attack-config";
import { demoAttackMetrics } from "./demo-metrics";
import type { AttackRunRow } from "./attack-runs";

type Actor = { accountId: string; kind: "HUMAN" | "BOT"; index: number; cookie: string; ip: string };
type Job = { actor: Actor; attempt: number; atMs: number };
type RequestResult = { status: number; reasonCode: string | null; operation: "challenge" | "join"; kind: Actor["kind"] };
const activeRuns = new Set<string>();

function fraction(seed: string, index: number) {
  let hash = 2166136261;
  for (const character of `${seed}:${index}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296;
}
function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms))); }

class Semaphore {
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(private limit: number) {}
  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active++;
    try { return await work(); }
    finally { this.active--; this.waiting.shift()?.(); }
  }
}

function solve(nonce: string, prefix: string) {
  for (let answer = 0; answer < 1_000_000; answer++) {
    if (createHash("sha256").update(`${nonce}:${answer}`).digest("hex").startsWith(prefix)) return String(answer);
  }
  throw new Error("Demo challenge could not be solved");
}

async function executeAttack(run: AttackRunRow, baseUrl: string) {
  const config = run.config;
  const eventId = run.event_id!;
  const started = performance.now();
  const db = await getDb();
  const results: RequestResult[] = [];
  try {
    const actors: Actor[] = await Promise.all(Array.from({ length: config.bots + config.humans }, async (_, index) => {
      const kind = index < config.bots ? "BOT" : "HUMAN";
      const localIndex = kind === "BOT" ? index : index - config.bots;
      const accountId = `${run.id}:${kind === "BOT" ? "bot" : "human"}:${localIndex}`;
      const ip = kind === "BOT" ? `198.51.100.${localIndex % 10 + 1}`
        : `203.0.${Math.floor(localIndex / 250)}.${localIndex % 250 + 1}`;
      return { accountId, kind, index: localIndex, cookie: await buyerCookieHeader(accountId), ip };
    }));
    const jobs: Job[] = actors.flatMap((actor) => {
      const count = actor.kind === "BOT" ? botAttempts(config) : 1;
      const offset = actor.kind === "BOT" ? Math.floor(fraction(config.seed, actor.index) * 250)
        : 700 + Math.floor(fraction(config.seed, actor.index + config.bots) * 300);
      return Array.from({ length: count }, (_, attempt) => ({ actor, attempt,
        atMs: offset + (actor.kind === "BOT" ? Math.floor(attempt * 1000 / config.requestsPerSecondPerBot) : 0) }));
    }).sort((a, b) => a.atMs - b.atMs || a.actor.kind.localeCompare(b.actor.kind) || a.actor.index - b.actor.index || a.attempt - b.attempt);
    const concurrency = new Semaphore(config.maxConcurrency);
    const adminCookie = await organizerCookieHeader();
    async function request(path: string, cookie: string, ip: string | null, operation: "challenge" | "join" | "admin", body?: unknown) {
      const response = await fetch(`${baseUrl}${path}`, { method: "POST", headers: {
        Cookie: cookie, ...(ip ? { "X-Forwarded-For": ip } : {}), ...(body ? { "Content-Type": "application/json" } : {}),
      }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000) });
      const data = await response.json() as Record<string, unknown>;
      return { status: response.status, data, reasonCode: typeof data.reasonCode === "string" ? data.reasonCode : null, operation };
    }
    const scheduleStarted = performance.now();
    await Promise.all(jobs.map(async (job) => {
      await sleep(job.atMs - (performance.now() - scheduleStarted));
      await concurrency.run(async () => {
        const { actor } = job;
        let challengeBody: { challengeId: string; answer: string } | undefined;
        const willSolve = actor.kind === "HUMAN" || config.challengeStrategy === "solve";
        try {
          if (config.defenses.challenge_enabled && willSolve && job.attempt === 0) {
            const challenge = await request(`/api/events/${eventId}/demo-challenge`, actor.cookie, actor.ip, "challenge");
            results.push({ status: challenge.status, reasonCode: challenge.reasonCode, operation: "challenge", kind: actor.kind });
            if (challenge.status !== 200) return;
            challengeBody = { challengeId: String(challenge.data.challengeId),
              answer: solve(String(challenge.data.nonce), String(challenge.data.prefix)) };
          }
          const join = await request(`/api/events/${eventId}/join`, actor.cookie, actor.ip, "join", challengeBody);
          results.push({ status: join.status, reasonCode: join.reasonCode, operation: "join", kind: actor.kind });
        } catch {
          // Failed HTTP calls remain visible in the saved request totals.
          results.push({ status: 0, reasonCode: "REQUEST_FAILED", operation: "join", kind: actor.kind });
        }
      });
    }));
    for (const operation of ["close-entry", "start-sale", "allocate"]) {
      const response = await request(`/api/admin/events/${eventId}/${operation}`, adminCookie, null, "admin");
      if (response.status !== 200) throw new Error(`${operation}: ${response.reasonCode ?? response.status}`);
    }
    const metrics = await demoAttackMetrics(eventId);
    if (!metrics) throw new Error("Attack metrics unavailable");
    const joinRequests = results.filter((row) => row.operation === "join");
    const summary = { runId: run.id, eventId, seed: config.seed, configuration: config,
      actualBuyerRequests: results.length, actualJoinRequests: joinRequests.length,
      failedHttpRequests: results.filter((row) => row.status === 0).length,
      throttledResponses: results.filter((row) => row.status === 429).length,
      rejectedJoinResponses: joinRequests.filter((row) => row.status >= 400).length,
      elapsedMs: Math.round(performance.now() - started),
      metrics: { ...metrics, feed: undefined },
    };
    await db.query("UPDATE simulation_runs SET status='COMPLETED',completed_at=clock_timestamp(),results=$2::jsonb WHERE id=$1",
      [run.id, JSON.stringify(summary)]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown simulator failure";
    await db.query("UPDATE simulation_runs SET status='FAILED',completed_at=clock_timestamp(),results=$2::jsonb WHERE id=$1",
      [run.id, JSON.stringify({ error: message, actualBuyerRequests: results.length })]);
  } finally { activeRuns.delete(run.id); }
}

export async function launchAttackRun(eventId: string, baseUrl: string) {
  if (activeRuns.size > 0) return { ok: false, reasonCode: "ANOTHER_RUN_ACTIVE" };
  const db = await getDb();
  const row = (await db.query<AttackRunRow>(
    `UPDATE simulation_runs SET status='RUNNING',started_at=clock_timestamp()
     WHERE event_id=$1 AND status='READY' AND config->>'kind'='ATTACK_DEMO' RETURNING *`, [eventId],
  )).rows[0];
  if (!row) return { ok: false, reasonCode: "RUN_NOT_READY" };
  activeRuns.add(row.id);
  // This local demo keeps the worker in the same Node process. A durable job
  // queue would be needed before deploying the simulator across instances.
  setTimeout(() => { void executeAttack(row, baseUrl); }, 0);
  return { ok: true, runId: row.id, eventId, status: "RUNNING" };
}

export async function recoverInterruptedAttackRun(eventId: string) {
  const db = await getDb();
  const row = (await db.query<{ id: string; started_at: string }>(
    "SELECT id,started_at FROM simulation_runs WHERE event_id=$1 AND status='RUNNING' AND config->>'kind'='ATTACK_DEMO'", [eventId],
  )).rows[0];
  // The simulator runs in this local Node process. After a restart, its
  // in-memory worker is gone, so an old RUNNING row cannot make progress.
  if (!row || activeRuns.has(row.id) || Date.now() - new Date(row.started_at).getTime() < 120_000) return;
  await db.query(`UPDATE simulation_runs SET status='FAILED',completed_at=clock_timestamp(),
    results=coalesce(results,'{}'::jsonb) || $2::jsonb WHERE id=$1 AND status='RUNNING'`,
  [row.id, JSON.stringify({ error: "Local simulator interrupted. Reset the demo to retry." })]);
}
