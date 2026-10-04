import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getDb, type Queryable } from "./db";
import { getDemoPolicy } from "./demo-policy";

const PREFIX = "000";

export async function issueDemoChallenge(eventId: string, accountId: string) {
  const policy = await getDemoPolicy(eventId);
  if (!policy?.challenge_enabled) return { ok: false, reasonCode: "CHALLENGE_NOT_ENABLED" };
  const db = await getDb();
  const actor = (await db.query("SELECT 1 FROM demo_actors WHERE event_id=$1 AND account_id=$2", [eventId, accountId])).rows[0];
  if (!actor) return { ok: false, reasonCode: "DEMO_ACTOR_REQUIRED" };
  const id = randomUUID();
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + 120_000).toISOString();
  await db.query("INSERT INTO demo_challenges (id,event_id,account_id,nonce,expires_at) VALUES ($1,$2,$3,$4,$5)",
    [id, eventId, accountId, nonce, expiresAt]);
  // A client finds an answer so SHA-256(nonce:answer) starts with 000.
  // This is a local demonstration challenge, not proof that a user is human.
  return { ok: true, challengeId: id, nonce, prefix: PREFIX, expiresAt };
}

export async function consumeDemoChallenge(tx: Queryable, eventId: string, accountId: string, challengeId: unknown, answer: unknown) {
  if (typeof challengeId !== "string" || typeof answer !== "string" || !/^[0-9a-f-]{36}$/.test(challengeId) || answer.length > 80)
    return { ok: false, reasonCode: "CHALLENGE_REQUIRED" };
  const row = (await tx.query<{ nonce: string; expires_at: string; consumed_at: string | null }>(
    "SELECT nonce,expires_at,consumed_at FROM demo_challenges WHERE id=$1 AND event_id=$2 AND account_id=$3 FOR UPDATE",
    [challengeId, eventId, accountId],
  )).rows[0];
  if (!row || row.consumed_at || new Date(row.expires_at).getTime() <= Date.now()) return { ok: false, reasonCode: "CHALLENGE_FAILED" };
  if (!createHash("sha256").update(`${row.nonce}:${answer}`).digest("hex").startsWith(PREFIX))
    return { ok: false, reasonCode: "CHALLENGE_FAILED" };
  await tx.query("UPDATE demo_challenges SET consumed_at=clock_timestamp() WHERE id=$1", [challengeId]);
  return { ok: true, reasonCode: "CHALLENGE_PASSED" };
}
