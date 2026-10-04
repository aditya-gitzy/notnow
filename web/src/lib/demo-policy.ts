import { getDb } from "./db";

export type DemoPolicy = {
  event_id: string;
  run_id: string;
  rate_limit_enabled: boolean;
  identity_limit_enabled: boolean;
  challenge_enabled: boolean;
  allocation_mode: "RANDOM" | "FIRST_COME";
};

export async function getDemoPolicy(eventId: string): Promise<DemoPolicy | null> {
  const db = await getDb();
  return (await db.query<DemoPolicy>("SELECT * FROM demo_run_policies WHERE event_id=$1", [eventId])).rows[0] ?? null;
}

export function parseDemoPolicy(value: unknown): Omit<DemoPolicy, "event_id" | "run_id"> | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.rateLimitEnabled !== "boolean" || typeof input.identityLimitEnabled !== "boolean" ||
      typeof input.challengeEnabled !== "boolean" || typeof input.allocationMode !== "string" ||
      !["RANDOM", "FIRST_COME"].includes(input.allocationMode)) return null;
  return { rate_limit_enabled: input.rateLimitEnabled, identity_limit_enabled: input.identityLimitEnabled,
    challenge_enabled: input.challengeEnabled, allocation_mode: input.allocationMode as "RANDOM" | "FIRST_COME" };
}

export async function updateDemoPolicy(eventId: string, input: ReturnType<typeof parseDemoPolicy>) {
  if (!input) return { ok: false, reasonCode: "INVALID_POLICY" };
  const db = await getDb();
  return db.transaction(async (tx) => {
    // Locking the event prevents a setting change midway through joining or drawing.
    const event = (await tx.query<{ status: string; simulation_run_id: string | null }>(
      "SELECT status,simulation_run_id FROM events WHERE id=$1 FOR UPDATE", [eventId],
    )).rows[0];
    const policy = (await tx.query<DemoPolicy>("SELECT * FROM demo_run_policies WHERE event_id=$1", [eventId])).rows[0];
    if (!event?.simulation_run_id || !policy || policy.run_id !== event.simulation_run_id) return { ok: false, reasonCode: "DEMO_RUN_REQUIRED" };
    const entries = (await tx.query<{ count: string }>("SELECT count(*)::text AS count FROM queue_entries WHERE event_id=$1", [eventId])).rows[0];
    if (event.status !== "ENTRY_OPEN" || Number(entries.count) > 0) return { ok: false, reasonCode: "RUN_ALREADY_STARTED" };
    await tx.query(`UPDATE demo_run_policies SET rate_limit_enabled=$2,identity_limit_enabled=$3,
      challenge_enabled=$4,allocation_mode=$5 WHERE event_id=$1`,
    [eventId, input.rate_limit_enabled, input.identity_limit_enabled, input.challenge_enabled, input.allocation_mode]);
    await tx.query("UPDATE events SET queue_policy_version=$2 WHERE id=$1", [eventId,
      input.allocation_mode === "RANDOM" ? "demo-seeded-random-v1" : "demo-first-come-v1"]);
    // The worker reads this saved configuration at launch. Keep it in sync with
    // the policy used by the real join and allocation endpoints.
    await tx.query("UPDATE simulation_runs SET config=jsonb_set(config,'{defenses}',$2::jsonb) WHERE id=$1",
      [policy.run_id, JSON.stringify(input)]);
    return { ok: true, policy: { ...policy, ...input } };
  });
}
