import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const base = process.env.BASE_URL ?? "http://localhost:3003";
const env = await readFile(".env.local", "utf8");
const secret = env.split(/\r?\n/).find((line) => line.startsWith("ADMIN_SECRET="))?.slice(13);
if (!secret) throw new Error("ADMIN_SECRET missing");
async function call(path, { method = "GET", cookie, key, body, redirect } = {}) {
  const response = await fetch(`${base}${path}`, { method, redirect, headers: {
    ...(cookie ? { Cookie: cookie } : {}), ...(key ? { "Idempotency-Key": key } : {}),
    ...(body ? { "Content-Type": "application/json" } : {}),
  }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(120_000) });
  return { status: response.status, data: response.headers.get("content-type")?.includes("json") ? await response.json() : null,
    cookie: response.headers.get("set-cookie")?.split(";")[0], location: response.headers.get("location") };
}
const admin = (await call("/api/admin/session", { method: "POST", body: { secret, captchaToken: "local-test" } })).cookie;
const id = (await call("/admin", { cookie: admin, redirect: "manual" })).location.split("/").at(-1);
const before = await call(`/api/admin/events/${id}/metrics`, { cookie: admin });
assert.equal(before.status, 200);
const population = before.data.queue.depth;
assert.ok(population >= 1);
const closeStart = performance.now();
const closed = await call(`/api/admin/events/${id}/close-entry`, { method: "POST", cookie: admin });
assert.equal(closed.status, 200, closed.data?.reasonCode);
assert.equal(closed.data.orderedCount, population);
const closeMs = Math.round(performance.now() - closeStart);
assert.equal((await call(`/api/admin/events/${id}/start-sale`, { method: "POST", cookie: admin })).status, 200);
const admit = await call(`/api/admin/events/${id}/admit`, { method: "POST", cookie: admin, key: "crowd-admit-first" });
assert.equal(admit.status, 200, admit.data?.reasonCode);
assert.equal(admit.data.admitted.length, Math.min(20, population));
assert.deepEqual(admit.data.admitted.map((row) => row.position), Array.from({ length: Math.min(20, population) }, (_, index) => index + 1));
const retry = await call(`/api/admin/events/${id}/admit`, { method: "POST", cookie: admin, key: "crowd-admit-first" });
assert.deepEqual(retry.data, admit.data);
const after = await call(`/api/admin/events/${id}/metrics`, { cookie: admin });
assert.equal(after.data.inventory.balanced, true);
assert.equal(after.data.queue.depth, population - admit.data.admitted.length);
console.log(JSON.stringify({ eventId: id, ordered: population, closeMs, admitted: admit.data.admitted.length,
  remainingQueued: after.data.queue.depth, retryIdempotent: true, inventoryBalanced: true }));
