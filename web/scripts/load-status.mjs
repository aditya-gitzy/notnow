import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";

const base = process.env.BASE_URL ?? "http://localhost:3003";
const clients = Number(process.env.LOAD_CLIENTS ?? 500);
const requests = Number(process.env.LOAD_REQUESTS ?? 1000);
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? 50);
if (![clients, requests, concurrency].every(Number.isInteger) || clients < 1 || clients > 50_000 || requests < 1 || requests > 100_000 || concurrency < 1 || concurrency > 1000) throw new Error("Invalid load configuration");
const env = await readFile(".env.local", "utf8");
const variable = (name) => env.split(/\r?\n/).find((line) => line.startsWith(`${name}=`))?.slice(name.length + 1);
const secret = variable("SESSION_SECRET");
const adminSecret = variable("ADMIN_SECRET");
if (!secret || !adminSecret) throw new Error("SESSION_SECRET and ADMIN_SECRET required in .env.local");
const login = await fetch(`${base}/api/admin/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: adminSecret, captchaToken: "local-test" }) });
if (!login.ok) throw new Error(`Admin login failed: ${login.status}`);
const adminCookie = login.headers.get("set-cookie")?.split(";")[0];
const current = await fetch(`${base}/admin`, { headers: { Cookie: adminCookie }, redirect: "manual" });
const eventId = current.headers.get("location")?.split("/").at(-1);
if (!eventId) throw new Error("Current event missing");
const metrics = await fetch(`${base}/api/admin/events/${eventId}/metrics`, { headers: { Cookie: adminCookie } }).then((r) => r.json());
const cookies = Array.from({ length: clients }, (_, i) => {
  const body = Buffer.from(JSON.stringify({ sub: `crowd-${i + 1}`, role: "buyer", exp: Date.now() + 3_600_000 })).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `fd_buyer=${body}.${signature}`;
});
let next = 0;
const samples = [];
const failures = [];
const start = performance.now();
await Promise.all(Array.from({ length: Math.min(concurrency, requests) }, async () => {
  while (next < requests) {
    const index = next++;
    const requestStart = performance.now();
    try {
      const response = await fetch(`${base}/api/events/${eventId}/me`, { headers: { Cookie: cookies[index % clients] }, signal: AbortSignal.timeout(30_000) });
      const data = await response.json();
      samples.push(performance.now() - requestStart);
      if (response.status !== 200 || data.buyer?.entry?.id !== `crowd-entry-${index % clients + 1}`) failures.push({ index, status: response.status, reason: data.reasonCode ?? data.buyer?.reasonCode });
    } catch (error) { failures.push({ index, error: String(error) }); }
  }
}));
const elapsedMs = performance.now() - start;
samples.sort((a, b) => a - b);
const percentile = (p) => samples.length ? Math.round(samples[Math.min(samples.length - 1, Math.ceil(samples.length * p) - 1)]) : null;
console.log(JSON.stringify({ queuedAccounts: metrics.queue.depth, clients, requests, concurrency,
  succeeded: requests - failures.length, failed: failures.length, sampleFailures: failures.slice(0, 5),
  elapsedSeconds: Math.round(elapsedMs / 100) / 10, throughputRps: Math.round(requests / elapsedMs * 1000),
  latencyMs: { p50: percentile(0.5), p95: percentile(0.95) } }));
if (failures.length) process.exitCode = 1;
