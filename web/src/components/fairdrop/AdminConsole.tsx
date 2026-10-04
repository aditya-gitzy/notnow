"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { EventRow } from "@/lib/event";
import { ProtectedAdmin } from "./ProtectedAdmin";
import { EventArtwork } from "./EventArtwork";
import Link from "next/link";
import { Activity, ArrowUpRight, CalendarDays, Clock3, MapPin, ShieldCheck, Ticket, Users } from "lucide-react";

type Overview = { event: EventRow; queue: { entries: { displayName: string; position: number | null; state: string; admissionExpiresAt: string | null }[] } };
type Metrics = {
  inventory: { total: number; available: number; reserved: number; sold: number; balanced: boolean };
  queue: { depth: number; admitted: number; reserved: number; confirmed: number; expired: number };
  reservations: { active: number; confirmed: number; expired: number };
  orders: number; throttledRequests: number; errorRequests: number;
  abuse: { duplicatePeople: number; challengeFailures: number; invalidInvitations: number };
  recentDecisions: { id: string; type: string; reasonCode: string | null; occurredAt: string }[];
};
type Operation = "open-entry" | "close-entry" | "start-sale" | "admit" | "expire-holds";

export function AdminConsole({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const resetKey = useRef<string | null>(null);
  const load = useCallback(async () => {
    const [stateResponse, metricsResponse] = await Promise.all([
      fetch(`/api/admin/events/${eventId}`, { cache: "no-store" }),
      fetch(`/api/admin/events/${eventId}/metrics`, { cache: "no-store" }),
    ]);
    if (!stateResponse.ok || !metricsResponse.ok) throw new Error("Unable to load organizer state.");
    setOverview(await stateResponse.json());
    setMetrics(await metricsResponse.json());
  }, [eventId]);
  useEffect(() => {
    void load().catch(() => setNotice("Unable to load organizer state."));
    const interval = window.setInterval(() => { void load().catch(() => setNotice("Unable to refresh organizer state.")); }, 5000);
    return () => window.clearInterval(interval);
  }, [load]);

  async function act(operation: Operation) {
    setPending(operation); setNotice("");
    try {
      const response = await fetch(`/api/admin/events/${eventId}/${operation}`, {
        method: "POST", headers: operation === "admit" ? { "Idempotency-Key": crypto.randomUUID() } : {},
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? result.reasonCode ?? "Operation failed");
      setNotice(operation === "admit" ? `${result.admitted.length} buyer(s) admitted. ${result.activeAdmissions} active admission(s).`
        : operation === "expire-holds" ? `${result.expired} expired hold(s) released.`
          : result.reasonCode.replaceAll("_", " ").toLowerCase());
      await load();
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : "Operation failed."); }
    finally { setPending(null); }
  }

  async function resetDemo() {
    setPending("reset-demo"); setNotice("");
    resetKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch(`/api/admin/events/${eventId}/reset-demo`, {
        method: "POST", headers: { "Idempotency-Key": resetKey.current },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? result.reasonCode ?? "Reset failed");
      resetKey.current = null;
      router.push(`/admin/events/${result.eventId}`);
      router.refresh();
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : "Reset failed. Retry uses the same key."); }
    finally { setPending(null); }
  }

  const event = overview?.event;
  const queue = metrics?.queue;
  const stages = ["DRAFT", "ENTRY_OPEN", "ENTRY_CLOSED", "SELLING"] as const;
  const stageIndex = event ? stages.indexOf(event.status as typeof stages[number]) : -1;
  const completedStages = event?.status === "SOLD_OUT" || event?.status === "CLOSED" ? stages.length : stageIndex;
  const totalSeats = metrics?.inventory.total ?? event?.total_inventory ?? 0;
  const seatPercent = (count: number) => totalSeats > 0 ? `${Math.min(100, Math.max(0, count / totalSeats * 100))}%` : "0%";
  const nextAction: { label: string; operation: Operation; help: string } | null = !event ? null
    : event.status === "DRAFT" ? { label: "Open entry", operation: "open-entry", help: "Open the entry window when its published start time arrives." }
      : event.status === "ENTRY_OPEN" ? { label: "Close entry and run draw", operation: "close-entry", help: "Freeze entries and assign one random position to each eligible attendee." }
        : event.status === "ENTRY_CLOSED" ? { label: "Start the sale", operation: "start-sale", help: "Begin admitting attendees in controlled batches." }
          : event.status === "SELLING" ? { label: "Admit next batch", operation: "admit", help: "Invite the next eligible attendees to hold a seat." } : null;
  return <>
    <div className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-slate-500"><Link href="/admin/events" className="hover:text-blue-700">Organiser</Link><span>/</span><span className="text-blue-700">Event control</span></div>
    <section className="relative overflow-hidden rounded-[2rem] bg-slate-950 text-white shadow-xl">
      {event && <div className="absolute inset-0 opacity-35"><EventArtwork event={event} /></div>}
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/95 to-slate-950/30" />
      <div className="relative grid min-h-80 gap-9 p-7 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-end lg:p-12">
        <div className="max-w-3xl"><div className="flex flex-wrap items-center gap-3"><span className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[.16em] text-white">Organiser workspace</span><span className="flex items-center gap-2 rounded-full bg-blue-600 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white"><span className="h-2 w-2 rounded-full bg-green-300" />{event?.status.replaceAll("_", " ") ?? "Loading"}</span></div>
          <h1 className="display mt-7 text-4xl leading-tight sm:text-6xl">{event?.name ?? "Loading event…"}</h1>
          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-slate-200"><span className="flex items-center gap-2"><CalendarDays size={17} aria-hidden="true" />{event?.event_starts_at ? `${new Date(event.event_starts_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })} IST` : "Date to be announced"}</span><span className="flex items-center gap-2"><MapPin size={17} aria-hidden="true" />{event?.venue || "Venue to be announced"}</span><span className="flex items-center gap-2"><Ticket size={17} aria-hidden="true" />{event?.total_inventory ?? "—"} seats</span></div>
        </div>
        <div className="rounded-2xl border border-white/20 bg-slate-950/70 p-5 backdrop-blur-sm lg:w-64"><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-200"><Clock3 size={15} aria-hidden="true" /> Entry deadline</p><p className="mt-3 text-xl font-bold">{event ? new Date(event.entry_closes_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "Loading…"}</p><p className="mt-1 text-xs text-slate-300">India Standard Time</p></div>
      </div>
    </section>
    <nav aria-label="Event tools" className="mt-5 grid gap-3 text-sm font-bold sm:grid-cols-3"><Link href={`/event/${eventId}`} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 text-blue-700 shadow-sm transition-transform hover:-translate-y-1"><span className="flex items-center gap-3"><Users size={20} aria-hidden="true" /> Attendee page</span><ArrowUpRight size={18} aria-hidden="true" /></Link><Link href={`/admin/events/${eventId}/attack`} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 text-blue-700 shadow-sm transition-transform hover:-translate-y-1"><span className="flex items-center gap-3"><Activity size={20} aria-hidden="true" /> Bot simulator</span><ArrowUpRight size={18} aria-hidden="true" /></Link><Link href={`/admin/events/${eventId}/lab`} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 text-blue-700 shadow-sm transition-transform hover:-translate-y-1"><span className="flex items-center gap-3"><ShieldCheck size={20} aria-hidden="true" /> Fairness Lab</span><ArrowUpRight size={18} aria-hidden="true" /></Link></nav>
    <section aria-label="Sale progress" className="mt-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">Sale progress</h2><span className="text-xs font-semibold text-slate-500">Updates every 5 seconds</span></div><ol className="mt-6 grid gap-3 sm:grid-cols-4">{stages.map((stage, index) => <li key={stage} aria-current={index === stageIndex ? "step" : undefined} className={`rounded-xl border p-4 ${index === stageIndex ? "border-blue-600 bg-blue-50" : index < completedStages ? "border-green-200 bg-green-50" : "border-slate-200 bg-slate-50"}`}><span className={`text-xs font-bold uppercase tracking-wider ${index === stageIndex ? "text-blue-700" : index < completedStages ? "text-green-800" : "text-slate-500"}`}>{index < completedStages ? "Complete" : index === stageIndex ? "Current" : "Upcoming"}</span><span className="mt-2 block font-bold">{["Draft", "Entry open", "Random draw", "Selling"][index]}</span></li>)}</ol></section>
    <section className="relative mt-7 grid gap-5 overflow-hidden rounded-2xl bg-blue-600 p-7 text-white shadow-lg md:grid-cols-[1fr_auto] md:items-center"><div className="absolute -right-12 -top-20 h-56 w-56 rounded-full border-[35px] border-white/10" /><div className="relative"><p className="text-xs font-bold uppercase tracking-[.2em] text-blue-100">Next recommended action</p><h2 className="display mt-2 text-3xl sm:text-4xl">{nextAction ? nextAction.label : event ? "Sale controls are up to date" : "Loading controls…"}</h2><p className="mt-2 max-w-2xl text-sm text-blue-50">{nextAction?.help ?? (event ? "Review live inventory, queue activity, and decisions below." : "")}</p></div>
      {nextAction && <button type="button" disabled={!!pending || (event?.status === "DRAFT" && Date.now() < new Date(event.entry_opens_at).getTime())} onClick={() => void act(nextAction.operation)} className="relative rounded-xl bg-white px-6 py-3 text-sm font-bold text-blue-700 shadow-sm hover:bg-blue-50 disabled:opacity-50">{pending === nextAction.operation ? "Working…" : `${nextAction.label} →`}</button>}
    </section>
    <p role="status" className="mt-3 min-h-5 text-sm font-semibold text-blue-800">{notice}</p>
    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="Available" value={metrics?.inventory.available} accent="blue" />
      <Metric label="Held" value={metrics?.inventory.reserved} accent="amber" />
      <Metric label="Sold" value={metrics?.inventory.sold} accent="green" />
      <Metric label="Queued" value={queue?.depth} accent="slate" />
    </div>
    <section aria-label="Seat inventory" className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Seat inventory</p><h2 className="mt-1 text-xl font-bold">{metrics ? `${metrics.inventory.sold} of ${totalSeats} seats sold` : "Loading inventory…"}</h2></div><span className="text-sm font-semibold text-slate-500">Live database totals</span></div><div className="mt-5 flex h-4 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={metrics ? `${metrics.inventory.sold} sold, ${metrics.inventory.reserved} held, ${metrics.inventory.available} available` : "Inventory loading"}><span className="bg-green-500" style={{ width: seatPercent(metrics?.inventory.sold ?? 0) }} /><span className="bg-amber-600" style={{ width: seatPercent(metrics?.inventory.reserved ?? 0) }} /><span className="bg-blue-600" style={{ width: seatPercent(metrics?.inventory.available ?? 0) }} /></div><div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs font-semibold text-slate-600"><span><i className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-green-500" />Sold</span><span><i className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-amber-600" />Held</span><span><i className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-blue-600" />Available</span></div></section>
    {event && <details className="mt-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><summary className="cursor-pointer text-xl font-bold">Identity and invitation setup</summary><div className="mt-5"><ProtectedAdmin eventId={eventId} mode={event.access_mode} /></div></details>}
    <details className="mt-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><summary className="cursor-pointer text-xl font-bold">All sale controls</summary>
        <p className="mt-4 text-sm text-slate-600">These controls change the server-side event state. The next recommended action is highlighted above.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Control label="Open entry" disabled={!event || event.status !== "DRAFT" || !!pending} onClick={() => act("open-entry")} />
          <Control label="Close & order entry" disabled={!event || event.status !== "ENTRY_OPEN" || !!pending} onClick={() => act("close-entry")} />
          <Control label="Start sale" disabled={!event || event.status !== "ENTRY_CLOSED" || !!pending} onClick={() => act("start-sale")} />
          <Control label="Admit next batch" disabled={!event || event.status !== "SELLING" || !!pending} onClick={() => act("admit")} primary />
          <Control label="Release expired holds" disabled={!event || !!pending} onClick={() => act("expire-holds")} />
        </div>
    </details>
    <details className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><summary className="cursor-pointer text-xl font-bold">Published policy and inventory checks</summary>
        <div className={`mt-5 rounded-xl border p-4 text-sm font-bold ${metrics?.inventory.balanced ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          Inventory balance: {metrics ? metrics.inventory.balanced ? "PASS" : "FAIL" : "Loading"} · {metrics?.inventory.available ?? "—"} available + {metrics?.inventory.reserved ?? "—"} held + {metrics?.inventory.sold ?? "—"} sold = {metrics?.inventory.total ?? "—"} total
        </div>
        <dl className="mt-5 space-y-3 text-sm">
          <Info label="Ordering" value="Random order once at entry close" />
          <Info label="Late entry" value="Closed after cutoff" />
          <Info label="Policy version" value={event?.queue_policy_version ?? "—"} />
          <Info label="Eligible entries" value={String(event?.ordered_count ?? "Pending")} />
          <Info label="Batch capacity" value={String(event?.batch_size ?? "—")} />
          <Info label="Admission window" value={event ? `${event.admission_ttl_seconds} seconds` : "—"} />
          <Info label="Ordered at" value={event?.ordered_at ? new Date(event.ordered_at).toLocaleString() : "Not yet ordered"} />
        </dl>
    </details>
    <details className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><summary className="cursor-pointer text-xl font-bold">Requests, holds, and recent decisions</summary>
        <div className="mt-5 grid gap-7 lg:grid-cols-2"><div><h3 className="font-bold">Requests and holds</h3>
        <dl className="mt-5 space-y-3 text-sm">
          <Info label="Throttled requests" value={String(metrics?.throttledRequests ?? 0)} />
          <Info label="Rejected requests" value={String(metrics?.errorRequests ?? 0)} />
          <Info label="Active holds" value={String(metrics?.reservations.active ?? 0)} />
          <Info label="Expired holds" value={String(metrics?.reservations.expired ?? 0)} />
          <Info label="Expired queue entries" value={String(queue?.expired ?? 0)} />
          {event?.access_mode === "PROTECTED" && <><Info label="Duplicate attendee attempts" value={String(metrics?.abuse.duplicatePeople ?? 0)} /><Info label="Invalid invitation attempts" value={String(metrics?.abuse.invalidInvitations ?? 0)} /><Info label="Challenge failures" value={String(metrics?.abuse.challengeFailures ?? 0)} /></>}
        </dl>
        {event?.access_mode === "DEMO" && !event.is_listed && <div className="mt-8 border-t border-slate-200 pt-6"><h3 className="font-bold">Fresh demo event</h3><p className="mt-2 text-sm text-slate-600">Creates a new empty event and makes it the landing page demo. Earlier events, orders, audits, and simulation results stay available.</p><button type="button" disabled={!!pending} onClick={() => void resetDemo()} className="mt-4 rounded-lg border border-slate-300 px-4 py-3 text-sm font-bold hover:border-blue-500 disabled:opacity-40">Start fresh demo</button></div>}
        </div><div><h3 className="font-bold">Recent decisions</h3>
        <ul className="mt-5 max-h-80 space-y-3 overflow-auto text-sm">{metrics?.recentDecisions.map((decision) => <li key={decision.id} className="border-b border-slate-100 pb-3"><p className="font-semibold">{decision.type.replaceAll("_", " ")}</p><p className="text-slate-500">{decision.reasonCode ?? "—"} · {new Date(decision.occurredAt).toLocaleString()}</p></li>)}</ul>
        {metrics && metrics.recentDecisions.length === 0 && <p className="mt-5 text-sm text-slate-500">No decisions yet.</p>}
        </div></div>
    </details>
    <details className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><summary className="cursor-pointer p-6 text-xl font-bold">Queue entries · {overview?.queue.entries.length ?? 0}</summary>
      <div className="border-b border-slate-200 p-6"><h2 className="text-xl font-bold">Queue entries</h2><p className="mt-1 text-sm text-slate-500">Positions stay fixed after close. Admissions use the next waiting positions.</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-6 py-3">Position</th><th className="px-6 py-3">Buyer</th><th className="px-6 py-3">State</th><th className="px-6 py-3">Admission ends</th></tr></thead><tbody>{overview?.queue.entries.map((entry, index) => <tr key={`${entry.displayName}-${index}`} className="border-t border-slate-100"><td className="px-6 py-4 font-bold tabular">{entry.position ?? "Pending"}</td><td className="px-6 py-4">{entry.displayName}</td><td className="px-6 py-4">{entry.state}</td><td className="px-6 py-4 tabular">{entry.admissionExpiresAt ? new Date(entry.admissionExpiresAt).toLocaleTimeString() : "—"}</td></tr>)}</tbody></table>{overview && overview.queue.entries.length === 0 && <p className="p-6 text-sm text-slate-500">No buyers have joined yet.</p>}</div>
    </details>
  </>;
}

function Metric({ label, value, accent }: { label: string; value: number | undefined; accent: "blue" | "amber" | "green" | "slate" }) { const bar = { blue: "bg-blue-600", amber: "bg-amber-600", green: "bg-green-500", slate: "bg-slate-700" }[accent]; return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className={`h-1.5 ${bar}`} /><div className="p-5"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="display mt-3 text-4xl tabular">{value ?? "—"}</p></div></div>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4 border-b border-slate-100 pb-2"><dt className="text-slate-500">{label}</dt><dd className="text-right font-semibold">{value}</dd></div>; }
function Control({ label, disabled, onClick, primary = false }: { label: string; disabled: boolean; onClick: () => void; primary?: boolean }) { return <button type="button" disabled={disabled} onClick={onClick} className={`rounded-lg px-4 py-3 text-sm font-bold disabled:opacity-40 ${primary ? "bg-blue-600 text-white hover:bg-blue-700" : "border border-slate-300 bg-white hover:border-blue-500"}`}>{label}</button>; }
