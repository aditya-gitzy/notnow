import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const base = process.env.BASE_URL ?? "http://localhost:3008";
const env = await readFile(".env.local", "utf8");
const secret = env.split(/\r?\n/).find((line) => line.startsWith("ADMIN_SECRET="))?.slice(13);
if (!secret) throw new Error("ADMIN_SECRET missing");
async function call(path, { method = "GET", cookie, body, redirect } = {}) {
  const response = await fetch(`${base}${path}`, { method, redirect, headers: {
    ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}),
  }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: response.headers.get("content-type")?.includes("json") ? await response.json() : null,
    cookie: response.headers.get("set-cookie")?.split(";")[0], location: response.headers.get("location") };
}
const admin = (await call("/api/admin/session", { method: "POST", body: { secret, captchaToken: "local-test" } })).cookie;
assert.ok(admin);
const sourceId = (await call("/admin", { cookie: admin, redirect: "manual" })).location.split("/").at(-1);
const config = { seed: "attack-phase3-check", bots: 12, humans: 6, seats: 5,
  requestsPerSecondPerBot: 2, fakeIdentities: 3, retryBehavior: "repeat", challengeStrategy: "ignore", maxConcurrency: 8,
  defenses: { rateLimitEnabled: true, identityLimitEnabled: true, challengeEnabled: true, allocationMode: "RANDOM" } };
assert.equal((await call(`/api/admin/events/${sourceId}/attack/run`, { method: "POST", body: config })).status, 403);
const launch = await call(`/api/admin/events/${sourceId}/attack/run`, { method: "POST", cookie: admin, body: config });
assert.equal(launch.status, 202, launch.data?.reasonCode);
const firstId = launch.data.eventId;

async function waitForRun(eventId) {
  const start = Date.now();
  let firstLiveChangeMs = null;
  let final;
  while (Date.now() - start < 120_000) {
    const metrics = await call(`/api/admin/events/${eventId}/attack-metrics`, { cookie: admin });
    assert.equal(metrics.status, 200);
    if (firstLiveChangeMs === null && (metrics.data.totalEntries > 0 || metrics.data.blockedRequests > 0))
      firstLiveChangeMs = Date.now() - start;
    const run = await call(`/api/admin/events/${eventId}/attack/run`, { cookie: admin });
    if (run.data.status === "COMPLETED" || run.data.status === "FAILED") { final = run.data; break; }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(final, "run did not finish");
  assert.equal(final.status, "COMPLETED", JSON.stringify(final.results));
  assert.ok(firstLiveChangeMs !== null);
  const metrics = (await call(`/api/admin/events/${eventId}/attack-metrics`, { cookie: admin })).data;
  assert.equal(metrics.totalEntries, 6);
  assert.equal(metrics.humanEntries, 6);
  assert.equal(metrics.botEntries, 0);
  assert.equal(metrics.seatsAllocated, 5);
  assert.equal(metrics.seatsRemaining, 0);
  assert.equal(metrics.oversold, 0);
  assert.equal(metrics.duplicateAllocations, 0);
  assert.equal(final.results.metrics.totalEntries, metrics.totalEntries);
  assert.equal(final.results.metrics.blockedRequests, metrics.blockedRequests);
  assert.ok(final.results.actualJoinRequests >= 18);
  return { eventId, runId: final.id, firstLiveChangeMs, requests: final.results.actualBuyerRequests,
    blocked: metrics.blockedRequests, entries: metrics.totalEntries, seats: metrics.seatsAllocated };
}
const first = await waitForRun(firstId);
const reset = await call(`/api/admin/events/${firstId}/attack/reset`, { method: "POST", cookie: admin });
assert.equal(reset.status, 200, reset.data?.reasonCode);
assert.notEqual(reset.data.eventId, firstId);
const empty = (await call(`/api/admin/events/${reset.data.eventId}/attack-metrics`, { cookie: admin })).data;
assert.equal(empty.totalEntries, 0);
assert.equal(empty.blockedRequests, 0);
assert.equal(empty.seatsAllocated, 0);
assert.equal(empty.seatsRemaining, 5);
assert.equal((await call(`/api/admin/events/${reset.data.eventId}/attack/run`, { cookie: admin })).data.status, "READY");
const relaunch = await call(`/api/admin/events/${reset.data.eventId}/attack/launch`, { method: "POST", cookie: admin });
assert.equal(relaunch.status, 202);
const second = await waitForRun(reset.data.eventId);
assert.notEqual(first.runId, second.runId);
assert.equal((await call(`/api/admin/events/${firstId}/attack/run`, { cookie: admin })).data.status, "COMPLETED");
console.log(JSON.stringify({ first, second, cleanReset: true, separateSavedRuns: true }));
