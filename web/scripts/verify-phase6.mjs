import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const base = process.env.BASE_URL ?? "http://localhost:3002";
const env = await readFile(".env.local", "utf8");
const secret = env.split(/\r?\n/).find((line) => line.startsWith("ADMIN_SECRET="))?.slice(13);
if (!secret) throw new Error("ADMIN_SECRET missing");

async function call(path, { method = "GET", cookie, key, body, redirect } = {}) {
  const response = await fetch(`${base}${path}`, { method, redirect, headers: {
    ...(cookie ? { Cookie: cookie } : {}), ...(key ? { "Idempotency-Key": key } : {}),
    ...(body ? { "Content-Type": "application/json" } : {}),
  }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: response.headers.get("content-type")?.includes("json") ? await response.json() : null,
    cookie: response.headers.get("set-cookie")?.split(";")[0], location: response.headers.get("location") };
}

const adminLogin = await call("/api/admin/session", { method: "POST", body: { secret, captchaToken: "local-test" } });
assert.equal(adminLogin.status, 200);
const admin = adminLogin.cookie;
const current = await call("/admin", { cookie: admin, redirect: "manual" });
const oldId = current.location.split("/").at(-1);
const reset = await call(`/api/admin/events/${oldId}/reset-demo`, { method: "POST", cookie: admin, key: "phase6-clean-reset" });
assert.equal(reset.status, 200);
const id = reset.data.eventId;
const event = `/api/events/${id}`;
const organizer = `/api/admin/events/${id}`;
const accounts = (await call("/api/demo-accounts")).data.accounts;
assert.ok(accounts.length >= 2);
const buyer = (await call("/api/session", { method: "POST", body: { accountId: accounts[0].id, captchaToken: "local-test" } })).cookie;
const other = (await call("/api/session", { method: "POST", body: { accountId: accounts[1].id, captchaToken: "local-test" } })).cookie;

async function invariant(expected) {
  const metrics = await call(`${organizer}/metrics`, { cookie: admin });
  assert.equal(metrics.status, 200);
  assert.equal(metrics.data.inventory.balanced, true);
  const { total, available, reserved, sold } = metrics.data.inventory;
  assert.equal(available + reserved + sold, total);
  if (expected) assert.deepEqual([available, reserved, sold], expected);
  return metrics.data;
}

assert.equal((await call(`${organizer}/metrics`, { cookie: buyer })).status, 403);
assert.equal((await call(`${organizer}/close-entry`, { method: "POST", cookie: buyer })).status, 403);
assert.equal((await call(`${event}/reserve`, { method: "POST", key: "phase6-no-user", body: {} })).status, 401);
await invariant([500, 0, 0]);
const joins = await Promise.all(Array.from({ length: 10 }, () => call(`${event}/join`, { method: "POST", cookie: buyer })));
assert.ok(joins.every((join) => join.status === 200));
const entryIds = new Set(joins.map((join) => join.data.buyer.entry.id));
assert.equal(entryIds.size, 1);
assert.equal((await invariant()).queue.depth, 1);

const close = await call(`${organizer}/close-entry`, { method: "POST", cookie: admin });
assert.equal(close.status, 200);
assert.equal(close.data.orderedCount, 1);
const before = (await call(`${event}/me`, { cookie: buyer })).data.buyer;
assert.equal(before.entry.position, 1);
const again = (await call(`${event}/me`, { cookie: buyer })).data.buyer;
assert.equal(again.entry.id, before.entry.id);
assert.equal(again.entry.position, 1);
assert.equal((await call(`${event}/join`, { method: "POST", cookie: other })).data.reasonCode, "ENTRY_CLOSED");
await invariant([500, 0, 0]);

assert.equal((await call(`${organizer}/start-sale`, { method: "POST", cookie: admin })).status, 200);
const admit = await call(`${organizer}/admit`, { method: "POST", cookie: admin, key: "phase6-admit-first" });
assert.equal(admit.status, 200);
assert.equal(admit.data.admitted.length, 1);
assert.equal((await call(`${event}/me`, { cookie: buyer })).data.buyer.state, "ADMITTED");
await invariant([500, 0, 0]);
const reserve = await call(`${event}/reserve`, { method: "POST", cookie: buyer, key: "phase6-reserve-first", body: {} });
assert.equal(reserve.status, 200, reserve.data?.reasonCode);
const reservationId = reserve.data.reservation.id;
assert.equal((await call(`${event}/me`, { cookie: buyer })).data.buyer.reservation.id, reservationId);
assert.equal((await call(`/api/reservations/${reservationId}/confirm`, { method: "POST", cookie: other })).status, 404);
await invariant([499, 1, 0]);
const confirm = await call(`/api/reservations/${reservationId}/confirm`, { method: "POST", cookie: buyer });
assert.equal(confirm.status, 200);
const after = (await call(`${event}/me`, { cookie: buyer })).data.buyer;
assert.equal(after.order.id, confirm.data.order.id);
assert.equal(after.receipt.finalPosition, 1);
assert.ok(after.receipt.acceptedAt && after.receipt.policyVersion);
assert.equal(after.receipt.purchaseOutcome, "CONFIRMED");
await invariant([499, 0, 1]);

console.log(JSON.stringify({ eventId: id, repeatedJoins: joins.length, uniqueEntries: entryIds.size,
  stablePosition: before.entry.position === again.entry.position, buyerAdminDenied: true,
  crossAccountConfirmDenied: true, fullFlow: "joined-ordered-admitted-reserved-confirmed",
  receipt: after.receipt.purchaseOutcome, inventoryBalancedAtEveryStep: true }));
