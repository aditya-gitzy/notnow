import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BuyerCTA } from "@/components/fairdrop/BuyerCTA";
import { EntryCountdown } from "@/components/fairdrop/EntryCountdown";
import { getBuyerState, getEvent } from "@/lib/event";
import { buyerAccountId } from "@/lib/session";
import { recaptchaSiteKey } from "@/lib/recaptcha";
import { EventArtwork } from "@/components/fairdrop/EventArtwork";

export const dynamic = "force-dynamic";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const accountId = await buyerAccountId();
  if (!accountId) redirect("/auth");
  const { id } = await params;
  const event = await getEvent(id);
  if (!event || event.simulation_run_id) notFound();
  const buyer = await getBuyerState(id, accountId, event);
  return <div className="min-h-screen bg-slate-50"><header className="border-b border-slate-200 bg-white"><div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-5"><Link href="/events" className="display text-2xl italic uppercase text-blue-600">Fair Drop.</Link><nav className="flex gap-5 text-sm font-bold"><Link href="/events" className="text-slate-700">All events</Link><Link href={`/waiting-room?event=${id}`} className="text-blue-700">My waiting room</Link></nav></div></header>
    <main className="mx-auto max-w-6xl px-5 py-12 sm:py-20"><div className="grid gap-8 lg:grid-cols-[1.1fr_.9fr] lg:items-center"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-blue-600">The drop</p><h1 className="display mt-4 text-5xl sm:text-7xl">{event.name}</h1><p className="mt-5 font-semibold text-slate-800">{event.event_starts_at ? new Date(event.event_starts_at).toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Kolkata" }) + " IST" : "Event date to be announced"} · {event.venue || "Venue to be announced"}</p><p className="mt-6 max-w-2xl text-lg text-slate-600">Enter once during the window. After it closes, the server assigns a random queue position. Selected attendees get a short hold to confirm a seat.</p></div><div className="h-64 overflow-hidden rounded-2xl bg-blue-800 shadow-sm sm:h-80"><EventArtwork event={event} /></div></div>
      <div className="mt-9 grid gap-5 sm:grid-cols-3"><div className="rounded-2xl border border-slate-200 bg-white p-6"><p className="text-sm font-bold text-slate-500">Entry closes in</p><p className="mt-3 text-2xl font-bold"><EntryCountdown closesAt={event.entry_closes_at} /></p></div><div className="rounded-2xl border border-slate-200 bg-white p-6"><p className="text-sm font-bold text-slate-500">Seats available</p><p className="mt-3 text-2xl font-bold tabular">{event.available}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-6"><p className="text-sm font-bold text-slate-500">Your status</p><p className="mt-3 text-2xl font-bold">{buyer.state.replaceAll("_", " ")}</p></div></div>
      <div className="mt-10 rounded-2xl bg-blue-600 p-8 text-white"><p className="text-sm font-bold uppercase tracking-[.18em] text-blue-100">One entry per account</p><h2 className="display mt-3 text-4xl">Join the waiting room.</h2><p className="mt-3 max-w-xl text-blue-50">Your entry stays with your signed-in account. Complete the challenge before entering.</p><div className="mt-6"><BuyerCTA event={event} buyer={buyer} light queueHref={`/waiting-room?event=${id}`} authHref="/auth" challengeSiteKey={recaptchaSiteKey()} /></div></div>
    </main></div>;
}
