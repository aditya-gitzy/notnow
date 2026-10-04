"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

function localDateTime(offsetMs: number) {
  const date = new Date(Date.now() + offsetMs);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function CreateEventForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [opensAt, setOpensAt] = useState(() => localDateTime(0));
  const [closesAt, setClosesAt] = useState(() => localDateTime(24 * 60 * 60 * 1000));
  const [eventStartsAt, setEventStartsAt] = useState(() => localDateTime(26 * 60 * 60 * 1000));
  const [venue, setVenue] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [seats, setSeats] = useState(500);
  const [batchSize, setBatchSize] = useState(20);
  const [holdMinutes, setHoldMinutes] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        name, opensAt: new Date(opensAt).toISOString(), closesAt: new Date(closesAt).toISOString(),
        eventStartsAt: new Date(eventStartsAt).toISOString(), venue, imageUrl, seats, batchSize, holdMinutes,
      }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Could not create event.");
      router.push(`/admin/events/${result.eventId}`);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create event."); setBusy(false); }
  }

  return <form onSubmit={(event) => void submit(event)} className="grid gap-5 sm:grid-cols-2">
    <label className="sm:col-span-2 text-sm font-bold">Event name<input required minLength={3} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Example: Indie Music Night" className="mt-2 block w-full rounded-lg border border-slate-300 p-3 font-normal" /></label>
    <label className="text-sm font-bold">Event date and time<input required type="datetime-local" value={eventStartsAt} onChange={(event) => setEventStartsAt(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 p-3 font-normal" /></label>
    <label className="text-sm font-bold">Venue or online location<input required minLength={2} maxLength={120} value={venue} onChange={(event) => setVenue(event.target.value)} placeholder="Example: City Arena, Mumbai" className="mt-2 block w-full rounded-lg border border-slate-300 p-3 font-normal" /></label>
    <label className="sm:col-span-2 text-sm font-bold">Event image URL <span className="font-normal text-slate-500">(optional, HTTPS)</span><input type="url" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://example.com/poster.jpg" className="mt-2 block w-full rounded-lg border border-slate-300 p-3 font-normal" /></label>
    <label className="text-sm font-bold">Entry opens<input required type="datetime-local" value={opensAt} onChange={(event) => setOpensAt(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 p-3 font-normal" /></label>
    <label className="text-sm font-bold">Entry closes<input required type="datetime-local" value={closesAt} onChange={(event) => setClosesAt(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 p-3 font-normal" /></label>
    <label className="text-sm font-bold">Seats<input required type="number" min={1} max={100000} value={seats} onChange={(event) => setSeats(Number(event.target.value))} className="mt-2 block w-full rounded-lg border border-slate-300 p-3 font-normal" /></label>
    <label className="text-sm font-bold">Admit per batch<input required type="number" min={1} max={seats} value={batchSize} onChange={(event) => setBatchSize(Number(event.target.value))} className="mt-2 block w-full rounded-lg border border-slate-300 p-3 font-normal" /></label>
    <label className="text-sm font-bold">Seat hold in minutes<input required type="number" min={1} max={30} value={holdMinutes} onChange={(event) => setHoldMinutes(Number(event.target.value))} className="mt-2 block w-full rounded-lg border border-slate-300 p-3 font-normal" /></label>
    <div className="sm:col-span-2"><p className="mb-4 text-sm text-slate-600">The event appears in the attendee catalog as soon as it is created. Future windows stay in draft until you open entry from its organiser console.</p><button disabled={busy} className="bg-blue-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? "Creating…" : "Create event"}</button>{error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}</div>
  </form>;
}
