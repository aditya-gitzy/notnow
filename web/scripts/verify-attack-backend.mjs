import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";

const base = process.env.BASE_URL ?? "http://localhost:3006";
const fixture = JSON.parse(process.env.PHASE2_ATTACK_FIXTURES ?? "null");
if (!fixture?.defended || !fixture?.baseline) throw new Error("Set PHASE2_ATTACK_FIXTURES to seed output");
const env = await readFile(".env.local", "utf8");
const variable = (name) => env.split(/\r?\n/).find((line) => line.startsWith(`${name}=`))?.slice(name.length + 1);
const sessionSecret = variable("SESSION_SECRET");
const adminSecret = variable("ADMIN_SECRET");
if (!sessionSecret || !adminSecret) throw new Error("Set SESSION_SECRET and ADMIN_SECRET in .env.local");
function buyerCookie(accountId) {
  const body = Buffer.from(JSON.stringify({ sub: accountId, role: "buyer", exp: Date.now() + 3_600_000 })).toString("base64url");
  return `fd_buyer=${body}.${createHmac("sha256", sessionSecret).update(body).digest("base64url")}`;
}
async function call(path, { method = "GET", cookie, body } = {}) {
  const response = await fetch(`${base}${path}`, { method, headers: {
    ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}),
  }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
}
const adminLogin = await call("/api/admin/session", { method: "POST", body: { secret: adminSecret, captchaToken: "local-test" } });
assert.equal(adminLogin.status, 200);
const admin = adminLogin.cookie;
async function solve(nonce, prefix) {
  for (let answer = 0; answer < 1_000_000; answer++) {
    if (createHash("sha256").update(`${nonce}:${answer}`).digest("hex").startsWith(prefix)) return String(answer);
  }
  throw new Error("Challenge could not be solved");
}
const defended = fixture.defended;
const defendedPath = `/api/events/${defended.eventId}`;
assert.equal((await call(`/api/admin/events/${defended.eventId}/attack-metrics`)).status, 403);
const required = await call(`${defendedPath}/join`, { method: "POST", cookie: buyerCookie(defended.accounts[0]) });
assert.equal(required.data.reasonCode, "CHALLENGE_REQUIRED");
for (const index of [0, 1, 3]) {
  const cookie = buyerCookie(defended.accounts[index]);
  const challenge = await call(`${defendedPath}/demo-challenge`, { method: "POST", cookie });
  assert.equal(challenge.status, 200);
  if (index === 1) {
    const bad = await call(`${defendedPath}/join`, { method: "POST", cookie,
      body: { challengeId: challenge.data.challengeId, answer: "bad" } });
    assert.equal(bad.data.reasonCode, "CHALLENGE_FAILED");
  }
  const answer = await solve(challenge.data.nonce, challenge.data.prefix);
  const joined = await call(`${defendedPath}/join`, { method: "POST", cookie,
    body: { challengeId: challenge.data.challengeId, answer } });
  assert.equal(joined.status, 200, joined.data.reasonCode);
}
const duplicate = await call(`${defendedPath}/join`, { method: "POST", cookie: buyerCookie(defended.accounts[2]) });
assert.equal(duplicate.data.reasonCode, "IDENTITY_ALREADY_ENTERED");
const limitResults = await Promise.all(Array.from({ length: 14 }, () => call(`${defendedPath}/join`, {
  method: "POST", cookie: buyerCookie(defended.accounts[0]),
})));
assert.ok(limitResults.some((result) => result.status === 429));

const baseline = fixture.baseline;
const baselinePath = `/api/events/${baseline.eventId}`;
for (const accountId of baseline.accounts) {
  const joined = await call(`${baselinePath}/join`, { method: "POST", cookie: buyerCookie(accountId) });
  assert.equal(joined.status, 200, joined.data.reasonCode);
}
const noLimit = await Promise.all(Array.from({ length: 14 }, () => call(`${baselinePath}/join`, {
  method: "POST", cookie: buyerCookie(baseline.accounts[0]),
})));
assert.ok(noLimit.every((result) => result.status === 200));

for (const { eventId } of [defended, baseline]) {
  const path = `/api/admin/events/${eventId}`;
  assert.equal((await call(`${path}/close-entry`, { method: "POST", cookie: admin })).status, 200);
  assert.equal((await call(`${path}/start-sale`, { method: "POST", cookie: admin })).status, 200);
  const allocated = await call(`${path}/allocate`, { method: "POST", cookie: admin });
  assert.equal(allocated.status, 200, allocated.data.reasonCode);
  assert.equal(allocated.data.allocated, 2);
  const metrics = await call(`${path}/attack-metrics`, { cookie: admin });
  assert.equal(metrics.status, 200);
  assert.equal(metrics.data.oversold, 0);
  assert.equal(metrics.data.duplicateAllocations, 0);
  assert.equal(metrics.data.inventoryBalanced, true);
  assert.equal(metrics.data.liveSeatsMatchInventory, true);
  assert.equal(metrics.data.seatsAllocated, 2);
  assert.equal(metrics.data.totalEntries, eventId === defended.eventId ? 3 : 4);
  assert.equal(metrics.data.botEntries, eventId === defended.eventId ? 1 : 2);
  if (eventId === defended.eventId) assert.ok(metrics.data.blockedRequests >= 3);
}
console.log(JSON.stringify({ defendedEntries: 3, baselineEntries: 4, challengeRejected: true,
  duplicateIdentityRejected: true, rateLimitChangedBehaviour: true, seatsEach: 2,
  oversold: 0, duplicateAllocations: 0 }));
