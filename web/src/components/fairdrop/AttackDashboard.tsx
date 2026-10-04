"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AttackGraphs } from "./AttackGraphs";
import { RollingValue } from "./RollingValue";

type Policy = { rate_limit_enabled: boolean; identity_limit_enabled: boolean; challenge_enabled: boolean; allocation_mode: "RANDOM" | "FIRST_COME" };
type Point = { at: string; humanEntries: number; botEntries: number; blockedRequests: number };
type Metrics = { policy: Policy; totalEntries: number; humanEntries: number; botEntries: number; blockedRequests: number;
  seatsRemaining: number; seatsAllocated: number; seatsWonByBots: number; botEntryShare: number; botSeatShare: number;
  oversold: number; duplicateAllocations: number; inventoryBalanced: boolean; liveSeatsMatchInventory: boolean;
  timeline: Point[]; serverTime: string;
  feed: { id: string; type: string; reasonCode: string | null; kind: string | null; occurredAt: string }[] };
type Run = { status: string; sourceEventId: string; config: { bots: number; humans: number; seats: number; seed: string }; results: { elapsedMs?: number; actualBuyerRequests?: number; error?: string } | null };
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
function appendMeasuredPoint(points: Point[], data: Metrics) {
  const point = { at: new Date(Math.floor(new Date(data.serverTime).getTime() / 1000) * 1000).toISOString(),
    humanEntries: data.humanEntries, botEntries: data.botEntries, blockedRequests: data.blockedRequests };
  const last = points.at(-1);
  if (last && last.at > point.at) return points;
  return [...(last?.at === point.at ? points.slice(0, -1) : points), point].slice(-120);
}

export function AttackDashboard({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [lastReceivedAt, setLastReceivedAt] = useState<number | null>(null);
  const [clock, setClock] = useState(Date.now());
  const loadMetrics = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/admin/events/${eventId}/attack-metrics`, { cache: "no-store", signal });
    if (!response.ok) throw new Error("Live data is unavailable.");
    const data = await response.json() as Metrics;
    if (!signal?.aborted) {
      setLastReceivedAt(Date.now());
      setMetrics((current) => {
        if (current && current.serverTime > data.serverTime) return current;
        return { ...data, timeline: appendMeasuredPoint(current?.timeline ?? [], data) };
      });
    }
  }, [eventId]);
  const loadRun = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/admin/events/${eventId}/attack/run`, { cache: "no-store", signal });
    if (!response.ok) throw new Error("Run status is unavailable.");
    const data = await response.json() as Run;
    if (!signal?.aborted) setRun(data);
    return data.status;
  }, [eventId]);
  const loadHistory = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/admin/events/${eventId}/attack-metrics?view=timeline`, { cache: "no-store", signal });
    if (!response.ok) return;
    const { timeline } = await response.json() as { timeline: Point[] };
    if (!signal?.aborted && timeline.length) setMetrics((current) => {
      if (!current) return current;
      const latestSaved = timeline.at(-1)!.at;
      return { ...current, timeline: [...timeline, ...current.timeline.filter((point) => point.at > latestSaved)].slice(-120) };
    });
  }, [eventId]);
  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    let stopped = false;
    let timer: number;
    let tick = 0;
    let historyLoaded = false;
    let finalHistoryLoaded = false;
    let polling = false;
    const controller = new AbortController();
    // Poll on a one-second cadence when the server is fast, without stacking
    // requests when the database is busy with the attack.
    const poll = async () => {
      if (stopped || document.visibilityState === "hidden") return;
      polling = true;
      const started = performance.now();
      try {
        const [status] = await Promise.all([
          tick++ % 3 === 0 ? loadRun(controller.signal) : Promise.resolve(null),
          loadMetrics(controller.signal),
        ]);
        if (!historyLoaded) { historyLoaded = true; void loadHistory(controller.signal); }
        if (status === "COMPLETED" && !finalHistoryLoaded) { finalHistoryLoaded = true; void loadHistory(controller.signal); }
        if (!stopped) setMessage("");
      }
      catch { if (!stopped) setMessage("Live data is reconnecting…"); }
      polling = false;
      if (!stopped && document.visibilityState === "visible") timer = window.setTimeout(poll, Math.max(0, 1000 - (performance.now() - started)));
    };
    const onVisibilityChange = () => {
      window.clearTimeout(timer);
      if (document.visibilityState === "visible" && !polling) void poll();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    void poll();
    return () => { stopped = true; controller.abort(); window.clearTimeout(timer); document.removeEventListener("visibilitychange", onVisibilityChange); };
  }, [loadMetrics, loadRun, loadHistory]);

  async function post(path: string, body?: object) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/events/${eventId}/${path}`, { method: "POST",
        headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
      const data = await response.json();
      if (!response.ok) throw new Error(data.reasonCode?.replaceAll("_", " ") ?? "Action failed");
      if (path === "attack/reset") { router.push(`/admin/events/${data.eventId}/attack/live`); return; }
      await Promise.all([loadMetrics(), loadRun()]);
      setMessage(path === "attack/launch" ? "Attack started. Real requests are now reaching the app." : "Defense saved for this run.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Action failed"); }
    finally { setBusy(false); }
  }
  function changePolicy(next: Policy) {
    void post("attack-policy", { rateLimitEnabled: next.rate_limit_enabled, identityLimitEnabled: next.identity_limit_enabled,
      challengeEnabled: next.challenge_enabled, allocationMode: next.allocation_mode });
  }
  const policy = metrics?.policy;
  const editable = run?.status === "READY" && !busy;
  const ageSeconds = lastReceivedAt === null ? null : Math.max(0, Math.floor((clock - lastReceivedAt) / 1000));
  return <>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-blue-600">Judge demo · live server data</p><h1 className="display mt-2 text-4xl sm:text-5xl">Fairness dashboard.</h1><p className="mt-3 text-slate-600">{run ? `${run.config.bots} bots · ${run.config.humans} humans · ${run.config.seats} seats · seed ${run.config.seed}` : "Loading run…"}</p></div><div className="flex flex-wrap gap-2"><Link className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-bold" href={run?.sourceEventId ? `/admin/events/${run.sourceEventId}/attack/results` : "#"}>Compare results</Link><Link className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-bold" href={run?.sourceEventId ? `/admin/events/${run.sourceEventId}/attack` : "#"}>New attack</Link></div></div>
    <div className={`relative mt-6 flex flex-wrap items-center gap-3 overflow-hidden rounded-xl border border-blue-200 bg-blue-50 p-4 ${run?.status === "RUNNING" ? "pb-5" : ""}`}><span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase text-blue-700">{run?.status ?? "Loading"}</span><span className="flex items-center gap-2 text-sm text-blue-950">{run?.status === "RUNNING" && <span aria-hidden="true" className="live-pulse h-2.5 w-2.5 rounded-full bg-blue-600" />}{ageSeconds === null ? "Connecting to live results…" : ageSeconds > 5 ? `Waiting for database · last verified ${ageSeconds}s ago` : `Last verified ${ageSeconds}s ago · checking live results`}</span>{run?.status === "READY" && <button disabled={busy} onClick={() => void post("attack/launch")} className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Launch attack</button>}{run && run.status !== "RUNNING" && <button disabled={busy} onClick={() => void post("attack/reset")} className="rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-bold text-blue-700 disabled:opacity-50">Reset demo</button>}{run?.status === "RUNNING" && <span aria-hidden="true" className="live-progress absolute bottom-0 left-0 h-1 w-full" />}</div>
    {run?.status === "FAILED" && <p role="alert" className="mt-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-800">The simulator stopped: {run.results?.error ?? "The run could not finish."} Reset the demo to try again.</p>}
    {message && <p role="status" className="mt-3 text-sm font-semibold text-blue-700">{message}</p>}
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[["Total entries", metrics?.totalEntries], ["Human entries", metrics?.humanEntries], ["Bot entries", metrics?.botEntries], ["Blocked requests", metrics?.blockedRequests], ["Seats remaining", metrics?.seatsRemaining]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="display mt-2 text-4xl tabular"><RollingValue value={String(value ?? "—")} /></p></div>)}</div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><Integrity label="Oversold" value={metrics?.oversold} valid={metrics?.oversold === 0 && metrics?.inventoryBalanced === true} /><Integrity label="Duplicate allocations" value={metrics?.duplicateAllocations} valid={metrics?.duplicateAllocations === 0 && metrics?.liveSeatsMatchInventory === true} /></div>
    <AttackGraphs data={metrics} running={run?.status === "RUNNING"} />
    <div className="mt-6 grid gap-6 lg:grid-cols-2"><section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-bold">Bots: entries vs seats won</h2><p className="mt-1 text-sm text-slate-500">{metrics?.seatsWonByBots ?? 0} of {metrics?.seatsAllocated ?? 0} allocated seats went to bots.</p><ShareBar label="Share of entries" value={metrics?.botEntryShare ?? 0} /><ShareBar label="Share of seats" value={metrics?.botSeatShare ?? 0} /><p className="mt-5 text-xs text-slate-500">Shares are calculated from real queue entries and active allocations.</p></section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-bold">Defense settings</h2><p className="mt-1 text-sm text-slate-500">Change a fresh run before launch. Reset creates a fresh event.</p><div className="mt-5 space-y-3">{policy && <><Toggle label="Rate limiting" checked={policy.rate_limit_enabled} disabled={!editable} onChange={() => changePolicy({ ...policy, rate_limit_enabled: !policy.rate_limit_enabled })} /><Toggle label="One entry per identity" checked={policy.identity_limit_enabled} disabled={!editable} onChange={() => changePolicy({ ...policy, identity_limit_enabled: !policy.identity_limit_enabled })} /><Toggle label="Bot challenge" checked={policy.challenge_enabled} disabled={!editable} onChange={() => changePolicy({ ...policy, challenge_enabled: !policy.challenge_enabled })} /><label className="flex items-center justify-between gap-3 text-sm font-semibold">Allocation mode<select disabled={!editable} value={policy.allocation_mode} onChange={(e) => changePolicy({ ...policy, allocation_mode: e.target.value as Policy["allocation_mode"] })} className="rounded-lg border border-slate-300 bg-white p-2 disabled:opacity-50"><option value="RANDOM">Random draw</option><option value="FIRST_COME">First come</option></select></label></>}</div><p className="mt-5 text-xs leading-relaxed text-slate-500">The challenge is a demo proof of work. Adaptive bots can solve it; it is not proof of a real person.</p></section></div>
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-bold">Live event feed</h2><p className="mt-1 text-sm text-slate-500">Newest database audit events first.</p><ul className="mt-5 max-h-80 divide-y divide-slate-100 overflow-y-auto text-sm">{metrics?.feed.map((item) => <li key={item.id} className="feed-enter flex flex-wrap justify-between gap-2 py-3"><span className="font-semibold">{feedText(item)}</span><time className="text-slate-500">{new Date(item.occurredAt).toLocaleTimeString()}</time></li>)}</ul>{metrics?.feed.length === 0 && <p className="mt-5 text-sm text-slate-500">Launch an attack to see requests and decisions here.</p>}</section>
    {run?.status === "COMPLETED" && run.results?.elapsedMs !== undefined && <p className="mt-5 text-sm text-slate-600">Run finished in {(run.results.elapsedMs / 1000).toFixed(1)} seconds with {run.results.actualBuyerRequests} real buyer endpoint requests.</p>}
  </>;
}
function Integrity({ label, value, valid }: { label: string; value?: number; valid: boolean }) { return <div className={`rounded-xl border p-5 ${value === undefined ? "border-slate-200 bg-white" : valid ? "border-green-300 bg-green-50 text-green-900" : "border-red-300 bg-red-50 text-red-900"}`}><p className="text-xs font-bold uppercase tracking-wider">{label}</p><p className="display mt-2 text-4xl tabular"><RollingValue value={String(value ?? "—")} /></p><p className="mt-1 text-xs font-semibold">{value === undefined ? "Loading" : valid ? "Database integrity check passed" : "Integrity check failed"}</p></div>; }
function ShareBar({ label, value }: { label: string; value: number }) { return <div className="mt-5"><div className="flex justify-between text-sm font-bold"><span>{label}</span><RollingValue value={pct(value)} /></div><div className="mt-2 h-5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600 transition-all duration-700" style={{ width: pct(value) }} /></div></div>; }
function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: () => void }) { return <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold">{label}<input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} className="h-5 w-5 accent-blue-600" /></label>; }
function feedText(item: Metrics["feed"][number]) { const who = item.kind === "BOT" ? "Bot" : item.kind === "HUMAN" ? "Human" : "Request"; const reason = item.reasonCode?.replaceAll("_", " ").toLowerCase(); if (item.type === "REQUEST_THROTTLED") return `${who} blocked: ${reason ?? "rate limit exceeded"}`; if (item.type === "REQUEST_REJECTED") return `${who} rejected: ${reason ?? "request rejected"}`; if (item.type === "QUEUE_JOIN") return `${who} entered the waiting room`; if (item.type === "SEAT_ALLOCATED") return `${who} won a seat`; return `${who}: ${item.type.replaceAll("_", " ").toLowerCase()}`; }
