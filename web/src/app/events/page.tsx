import Link from "next/link";
import { listPublicEvents } from "@/lib/event";
import { buyerAccountId } from "@/lib/session";
import { EventArtwork } from "@/components/fairdrop/EventArtwork";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const [events, accountId] = await Promise.all([listPublicEvents(), buyerAccountId()]);
  if (!accountId) redirect("/auth");
  return <div className="min-h-screen bg-slate-50"><header className="border-b border-slate-200 bg-white"><div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-5"><Link href="/events" className="display text-2xl italic uppercase text-blue-600">Fair Drop.</Link><nav className="flex gap-5 text-sm font-bold"><Link href="/about" className="text-slate-700">How it works</Link><Link href="/auth" className="text-blue-700">Switch account</Link></nav></div></header>
    <main className="mx-auto max-w-6xl px-5 py-12 sm:py-20"><p className="text-xs font-bold uppercase tracking-[.2em] text-blue-600">Attendee events</p><h1 className="display mt-3 text-5xl sm:text-6xl">Find your drop.</h1><p className="mt-5 max-w-2xl text-lg text-slate-600">Choose an event to see its entry window. Each event gives your account one place in its random draw.</p>
      <div className="mt-10 grid gap-5 md:grid-cols-2">{events.map((event) => <article key={event.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="h-48 overflow-hidden bg-blue-800"><EventArtwork event={event} /></div><div className="p-7"><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-700">{event.status === "ENTRY_OPEN" ? "Entry open" : event.status === "DRAFT" ? "Coming soon" : event.status.replaceAll("_", " ")}</span><h2 className="mt-4 text-2xl font-bold">{event.name}</h2><dl className="mt-4 space-y-2 text-sm text-slate-600"><div><dt className="inline font-bold text-slate-800">Event: </dt><dd className="inline">{event.event_starts_at ? `${new Date(event.event_starts_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })} IST` : "Date to be announced"}</dd></div><div><dt className="inline font-bold text-slate-800">Venue: </dt><dd className="inline">{event.venue || "To be announced"}</dd></div><div><dt className="inline font-bold text-slate-800">Entry: </dt><dd className="inline">{new Date(event.entry_opens_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}–{new Date(event.entry_closes_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })} IST</dd></div><div><dt className="inline font-bold text-slate-800">Seats: </dt><dd className="inline">{event.total_inventory}</dd></div></dl><Link href={`/event/${event.id}`} className="mt-6 inline-flex bg-blue-600 px-5 py-3 text-sm font-bold text-white">{event.status === "ENTRY_OPEN" ? "Join or view status" : event.status === "DRAFT" ? "View upcoming event" : "View event"} ↗</Link></div></article>)}</div>
      {events.length === 0 && <p className="mt-10 rounded-xl bg-white p-7 text-slate-600">No events have been published yet.</p>}
    </main></div>;
}
