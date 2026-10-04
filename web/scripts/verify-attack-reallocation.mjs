import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const base = process.env.BASE_URL ?? "http://localhost:3006";
const eventId = process.env.ATTACK_EVENT_ID;
if (!eventId) throw new Error("Set ATTACK_EVENT_ID");
const env = await readFile(".env.local", "utf8");
const secret = env.split(/\r?\n/).find((line) => line.startsWith("ADMIN_SECRET="))?.slice(13);
if (!secret) throw new Error("ADMIN_SECRET missing");
const login = await fetch(`${base}/api/admin/session`, { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ secret, captchaToken: "local-test" }) });
assert.equal(login.status, 200);
const cookie = login.headers.get("set-cookie")?.split(";")[0];
const allocated = await fetch(`${base}/api/admin/events/${eventId}/allocate`, { method: "POST", headers: { Cookie: cookie } }).then((r) => r.json());
assert.equal(allocated.allocated, 1);
const metrics = await fetch(`${base}/api/admin/events/${eventId}/attack-metrics`, { headers: { Cookie: cookie } }).then((r) => r.json());
assert.equal(metrics.totalEntries, 3);
assert.equal(metrics.seatsAllocated, 2);
assert.equal(metrics.seatsRemaining, 0);
assert.equal(metrics.oversold, 0);
assert.equal(metrics.duplicateAllocations, 0);
assert.equal(metrics.liveSeatsMatchInventory, true);
console.log(JSON.stringify({ nextPositionAllocated: true, activeSeats: metrics.seatsAllocated,
  seatsRemaining: metrics.seatsRemaining, oversold: metrics.oversold, duplicateAllocations: metrics.duplicateAllocations }));
