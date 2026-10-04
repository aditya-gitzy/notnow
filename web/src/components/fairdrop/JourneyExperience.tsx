"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BuyerState, EventRow } from "@/lib/event";
import { EntryCountdown } from "./EntryCountdown";

type Snapshot = { event: EventRow; buyer: BuyerState };
type Stage = "waiting-room" | "waitlist" | "confirm" | "ticket";

export function JourneyExperience({ eventId, stage }: { eventId: string; stage: Stage }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [connection, setConnection] = useState<"loading" | "live" | "reconnecting">("loading");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [connectionMessage, setConnectionMessage] = useState("");
  const reserveKey = useRef<string | null>(null);
  const retryAfter = useRef(0);
  const refresh = useCallback(async () => {
    if (Date.now() < retryAfter.current) return;
    try {
      const response = await fetch(`/api/events/${eventId}/me`, { cache: "no-store" });
      if (response.status === 429) {
        retryAfter.current = Date.now() + Number(response.headers.get("Retry-After") ?? 10) * 1000;
        throw new Error("Status checks are temporarily limited. We will retry shortly.");
      }
      if (!response.ok) throw new Error("We could not reach your saved status.");
      setData(await response.json());
      setLastUpdated(new Date());
      setConnection("live");
      setConnectionMessage("");
    } catch (cause) {
      // Keep the previous server snapshot visible during a network outage.
      setConnection("reconnecting");
      setConnectionMessage(cause instanceof Error ? cause.message : "Reconnecting to your saved status.");
    }
  }, [eventId]);
  useEffect(() => {
    void refresh();
    // The state is always loaded from the server. Reconnecting keeps the entry.
    const poll = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 10000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearInterval(poll); window.clearInterval(clock); document.removeEventListener("visibilitychange", visible); };
  }, [refresh]);

  async function checkout(operation: "reserve" | "confirm") {
    setBusy(true); setMessage("");
    try {
      if (operation === "reserve") reserveKey.current ??= crypto.randomUUID();
      const response = await fetch(operation === "reserve" ? `/api/events/${eventId}/reserve` : `/api/reservations/${data?.buyer.reservation?.id}/confirm`, {
        method: "POST", headers: operation === "reserve" ? { "Content-Type": "application/json", "Idempotency-Key": reserveKey.current! } : {},
        body: operation === "reserve" ? "{}" : undefined,
      });
      const result = await response.json();
      await refresh();
      if (!response.ok) throw new Error(result.message ?? result.reasonCode ?? "Please try again.");
      if (operation === "reserve") { reserveKey.current = null; setMessage("Seat held. Confirm it before the timer ends."); }
      else setMessage("Seat confirmed. Your ticket is ready.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Connection lost. Your saved state will reappear."); }
    finally { setBusy(false); }
  }

  const buyer = data?.buyer;
  const event = data?.event;
  const holdSeconds = buyer?.reservation ? Math.max(0, Math.ceil((new Date(buyer.reservation.expiresAt).getTime() - now) / 1000)) : 0;
  const title = { "waiting-room": "Waiting room", waitlist: "Your waitlist position", confirm: "Confirm your seat", ticket: "My ticket" }[stage];
  const flowHref = (path: string) => `${path}?event=${eventId}`;
  const currentStep = !buyer?.entry ? -1 : buyer.state === "CONFIRMED" ? 4 : buyer.state === "RESERVED" ? 3
    : buyer.entry.position !== null ? 2 : 0;
  const steps = ["Entry accepted", "Random draw", buyer?.state === "ADMITTED" ? "Selected" : "Waitlist or selected", "Seat held", "Ticket confirmed"];
  return <div className="min-h-screen bg-slate-50"><header className="border-b border-slate-200 bg-white"><div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-5"><Link href="/events" className="display text-2xl italic uppercase text-blue-600">Fair Drop.</Link><nav className="flex gap-5 text-sm font-bold text-blue-700"><Link href="/events">All events</Link><Link href={`/event/${eventId}`}>Event details</Link></nav></div></header>
    <main className="mx-auto max-w-4xl px-5 py-12 sm:py-20"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-blue-600">{event?.name ?? "Fair Drop"}</p><h1 className="display mt-3 text-5xl sm:text-6xl">{title}.</h1></div><p role="status" className={`text-sm font-semibold ${connection === "reconnecting" ? "text-amber-800" : "text-slate-600"}`}>{connection === "reconnecting" ? "Reconnecting… showing your last saved status" : lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Loading saved status…"}</p></div>
      {buyer?.entry && <nav aria-label="Your progress" className="mt-8 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-5"><ol className="grid min-w-[620px] grid-cols-5 gap-3">{steps.map((step, index) => <li key={step} aria-current={index === currentStep ? "step" : undefined} className={`border-t-4 pt-3 text-xs font-bold sm:text-sm ${index < currentStep ? "border-green-500 text-green-800" : index === currentStep ? "border-blue-600 text-blue-800" : "border-slate-200 text-slate-500"}`}><span className="block text-[11px] uppercase tracking-wider">Step {index + 1}</span>{step}</li>)}</ol></nav>}
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
        {!data && connection === "reconnecting" ? <div><h2 className="text-2xl font-bold">Unable to load your status.</h2><p className="mt-3 text-slate-600">Your place is still saved on the server. Check your connection and try again.</p><button type="button" onClick={() => void refresh()} className="mt-5 bg-blue-600 px-5 py-3 font-bold text-white">Retry status check</button></div> : !data ? <p>Loading your saved status…</p> : buyer?.state === "NOT_SIGNED_IN" ? <><h2 className="text-2xl font-bold">Sign in first</h2><p className="mt-3 text-slate-600">Your entry is tied to your attendee session.</p><Link className="mt-6 inline-block bg-blue-600 px-5 py-3 font-bold text-white" href="/auth">Sign in</Link></> : !buyer?.entry ? <><h2 className="text-2xl font-bold">No entry yet</h2><p className="mt-3 text-slate-600">Join during the event entry window.</p><Link className="mt-6 inline-block bg-blue-600 px-5 py-3 font-bold text-white" href={`/event/${eventId}`}>Go to event</Link></> : <>
          <p role="status" className="text-xs font-bold uppercase tracking-wider text-blue-600">{buyer.state.replaceAll("_", " ")}</p><h2 className="mt-3 text-3xl font-bold">{buyer.message}</h2>
          {event?.status === "ENTRY_OPEN" && <p className="mt-5 rounded-lg bg-blue-50 p-4 font-semibold text-blue-900">Entry closes in <EntryCountdown closesAt={event.entry_closes_at} />. Your random place appears after the draw.</p>}
          {buyer.entry.position && <p className="mt-5 text-xl font-bold tabular">Random position #{buyer.entry.position}{buyer.peopleAhead !== null ? ` · ${buyer.peopleAhead} ahead` : ""}</p>}
          {stage === "waiting-room" && buyer.state === "QUEUED" && buyer.entry.position && <Link href={flowHref("/waitlist")} className="mt-6 inline-block bg-blue-600 px-5 py-3 font-bold text-white">View waitlist position</Link>}
          {stage !== "confirm" && ["ADMITTED", "RESERVED"].includes(buyer.state) && <Link href={flowHref("/confirm")} className="mt-6 inline-block bg-blue-600 px-5 py-3 font-bold text-white">Confirm seat</Link>}
          {buyer.state === "CONFIRMED" && stage !== "ticket" && <Link href={flowHref("/ticket")} className="mt-6 inline-block bg-blue-600 px-5 py-3 font-bold text-white">View my ticket</Link>}
          {stage === "confirm" && buyer.state === "ADMITTED" && <><p className="mt-5 text-sm text-amber-800">Admission expires at {buyer.entry.admissionExpiresAt ? new Date(buyer.entry.admissionExpiresAt).toLocaleTimeString() : "soon"}.</p><button disabled={busy} onClick={() => void checkout("reserve")} className="mt-5 bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-50">Hold one seat</button></>}
          {stage === "confirm" && buyer.state === "RESERVED" && <><p className="mt-5 text-xl font-bold tabular">Hold expires in {Math.floor(holdSeconds / 60)}:{String(holdSeconds % 60).padStart(2, "0")}</p><button disabled={busy || holdSeconds === 0} onClick={() => void checkout("confirm")} className="mt-5 bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-50">Confirm demo seat</button></>}
          {stage === "ticket" && buyer.order && <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-6 text-green-950"><p className="text-xs font-bold uppercase tracking-wider">Confirmed ticket</p><p className="mt-2 text-2xl font-bold">{event?.name}</p><p className="mt-4 break-all font-mono text-sm">Order {buyer.order.id}</p><p className="mt-2 text-sm">Confirmed {new Date(buyer.order.confirmedAt).toLocaleString()}</p><p className="mt-3 text-xs">Demo ticket. No payment was taken.</p></div>}
          {stage === "ticket" && !buyer.order && <Link href={flowHref(buyer.state === "QUEUED" ? "/waitlist" : "/confirm")} className="mt-6 inline-block text-sm font-bold text-blue-700 underline">View current status</Link>}
          {(stage === "waitlist" || stage === "waiting-room") && <p className="mt-6 text-sm text-slate-500">This page checks for changes every 10 seconds. Refreshing restores the same server-stored entry.</p>}
          {message && <p role="status" className="mt-4 text-sm font-semibold text-blue-800">{message}</p>}
          {connectionMessage && <p role="status" className="mt-4 text-sm font-semibold text-amber-800">{connectionMessage}</p>}
          <div className="mt-8 border-t border-slate-200 pt-5 text-xs text-slate-500">Entry ID: {buyer.entry.id}</div>
        </>}
      </div>
    </main></div>;
}
