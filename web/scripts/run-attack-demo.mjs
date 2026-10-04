import { readFile } from "node:fs/promises";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const env = await readFile(".env.local", "utf8");
const secret = env.split(/\r?\n/).find((line) => line.startsWith("ADMIN_SECRET="))?.slice(13);
if (!secret) throw new Error("ADMIN_SECRET missing");
const login = await fetch(`${base}/api/admin/session`, { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ secret, captchaToken: "local-test" }) });
if (!login.ok) throw new Error(`Organizer login failed: ${login.status}`);
const cookie = login.headers.get("set-cookie")?.split(";")[0];
const current = await fetch(`${base}/admin`, { headers: { Cookie: cookie }, redirect: "manual" });
const sourceId = process.env.ATTACK_SOURCE_EVENT_ID ?? current.headers.get("location")?.split("/").at(-1);
if (!sourceId) throw new Error("Current event missing");
const config = {
  seed: process.env.ATTACK_SEED ?? "judge-demo-1",
  bots: Number(process.env.ATTACK_BOTS ?? 100), humans: Number(process.env.ATTACK_HUMANS ?? 100),
  seats: Number(process.env.ATTACK_SEATS ?? 50),
  requestsPerSecondPerBot: Number(process.env.ATTACK_RPS ?? 2),
  fakeIdentities: Number(process.env.ATTACK_FAKE_IDENTITIES ?? 20),
  retryBehavior: process.env.ATTACK_RETRY ?? "none",
  challengeStrategy: process.env.ATTACK_CHALLENGE_STRATEGY ?? "ignore",
  maxConcurrency: Number(process.env.ATTACK_CONCURRENCY ?? 24),
  defenses: { rateLimitEnabled: process.env.ATTACK_RATE_LIMIT !== "off",
    identityLimitEnabled: process.env.ATTACK_IDENTITY_LIMIT !== "off",
    challengeEnabled: process.env.ATTACK_CHALLENGE !== "off",
    allocationMode: process.env.ATTACK_MODE ?? "RANDOM" },
};
const launched = await fetch(`${base}/api/admin/events/${sourceId}/attack/run`, { method: "POST",
  headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(config) });
const launch = await launched.json();
if (launched.status !== 202) throw new Error(`Launch failed: ${JSON.stringify(launch)}`);
console.log(JSON.stringify({ launched: true, eventId: launch.eventId, runId: launch.runId, config }));
const started = Date.now();
let finished = false;
while (Date.now() - started < 10 * 60_000) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const response = await fetch(`${base}/api/admin/events/${launch.eventId}/attack/run`, { headers: { Cookie: cookie } });
  const run = await response.json();
  if (run.status === "COMPLETED" || run.status === "FAILED") {
    finished = true;
    console.log(JSON.stringify({ status: run.status, eventId: launch.eventId, runId: run.id, results: run.results }));
    if (run.status !== "COMPLETED") process.exitCode = 1;
    break;
  }
}
if (!finished) throw new Error("Attack run did not finish within 10 minutes");
