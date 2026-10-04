import type { DemoPolicy } from "./demo-policy";

export type AttackConfig = {
  seed: string;
  bots: number;
  humans: number;
  seats: number;
  requestsPerSecondPerBot: number;
  fakeIdentities: number;
  retryBehavior: "none" | "repeat" | "aggressive";
  challengeStrategy: "ignore" | "solve";
  maxConcurrency: number;
  defenses: Omit<DemoPolicy, "event_id" | "run_id">;
};

export function botAttempts(config: AttackConfig) {
  if (config.retryBehavior === "none") return 1;
  if (config.retryBehavior === "repeat") return Math.min(3, config.requestsPerSecondPerBot * 2);
  return Math.min(10, config.requestsPerSecondPerBot * 2);
}

export function validateAttackConfig(value: unknown): AttackConfig | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const defenses = data.defenses as Record<string, unknown> | undefined;
  const seed = data.seed;
  const bots = data.bots;
  const humans = data.humans ?? 100;
  const seats = data.seats ?? 50;
  const requestsPerSecondPerBot = data.requestsPerSecondPerBot;
  const fakeIdentities = data.fakeIdentities;
  const retryBehavior = data.retryBehavior;
  const challengeStrategy = data.challengeStrategy ?? "ignore";
  const maxConcurrency = data.maxConcurrency ?? 24;
  if (typeof seed !== "string" || !/^[a-zA-Z0-9_-]{3,40}$/.test(seed) ||
      !Number.isInteger(bots) || Number(bots) < 1 || Number(bots) > 3000 ||
      !Number.isInteger(humans) || Number(humans) < 1 || Number(humans) > 1000 ||
      !Number.isInteger(seats) || Number(seats) < 1 || Number(seats) > 500 ||
      !Number.isInteger(requestsPerSecondPerBot) || Number(requestsPerSecondPerBot) < 1 || Number(requestsPerSecondPerBot) > 20 ||
      !Number.isInteger(fakeIdentities) || Number(fakeIdentities) < 1 || Number(fakeIdentities) > Number(bots) ||
      !["none", "repeat", "aggressive"].includes(String(retryBehavior)) ||
      !["ignore", "solve"].includes(String(challengeStrategy)) ||
      !Number.isInteger(maxConcurrency) || Number(maxConcurrency) < 1 || Number(maxConcurrency) > 64 ||
      !defenses || typeof defenses.rateLimitEnabled !== "boolean" || typeof defenses.identityLimitEnabled !== "boolean" ||
      typeof defenses.challengeEnabled !== "boolean" || !["RANDOM", "FIRST_COME"].includes(String(defenses.allocationMode))) return null;
  const config: AttackConfig = {
    seed, bots: Number(bots), humans: Number(humans), seats: Number(seats),
    requestsPerSecondPerBot: Number(requestsPerSecondPerBot), fakeIdentities: Number(fakeIdentities),
    retryBehavior: retryBehavior as AttackConfig["retryBehavior"], challengeStrategy: challengeStrategy as AttackConfig["challengeStrategy"],
    maxConcurrency: Number(maxConcurrency),
    defenses: { rate_limit_enabled: defenses.rateLimitEnabled, identity_limit_enabled: defenses.identityLimitEnabled,
      challenge_enabled: defenses.challengeEnabled, allocation_mode: defenses.allocationMode as AttackConfig["defenses"]["allocation_mode"] },
  };
  // Keep an accidental "3,000 bots x 20 RPS" click from producing an
  // unbounded request storm on the developer's own laptop.
  if (config.bots * botAttempts(config) + config.humans > 12_000) return null;
  return config;
}
