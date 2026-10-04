import Link from "next/link";
import { redirect } from "next/navigation";
import { CreateEventForm } from "@/components/fairdrop/CreateEventForm";
import { listPublicEvents } from "@/lib/event";
import { organizerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  if (!(await organizerSession())) redirect("/admin");
  const events = await listPublicEvents();
  return <div className="min-h-screen bg-slate-50"><header className="border-b border-slate-200 bg-white"><div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-5"><Link href="/admin/events" className="display text-2xl italic uppercase text-blue-600">Fair Drop.</Link><Link href="/auth" className="text-sm font-bold text-blue-700">Switch role</Link></div></header>
    <main className="mx-auto max-w-6xl px-5 py-12"><p className="text-xs font-bold uppercase tracking-[.2em] text-blue-600">Organiser area</p><h1 className="display mt-3 text-5xl">Your events.</h1><p className="mt-4 text-slate-600">Create an event, then manage its entry window, random draw, admission, and fairness dashboard.</p>
      <section className="mt-9 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"><h2 className="text-2xl font-bold">Create an event</h2><div className="mt-6"><CreateEventForm /></div></section>
      <section className="mt-10"><h2 className="text-2xl font-bold">Published events</h2><div className="mt-5 grid gap-4 md:grid-cols-2">{events.map((event) => <article key={event.id} className="rounded-2xl border border-slate-200 bg-white p-6"><p className="text-xs font-bold uppercase tracking-wider text-blue-600">{event.status.replaceAll("_", " ")}</p><h3 className="mt-2 text-xl font-bold">{event.name}</h3><p className="mt-2 text-sm text-slate-600">{event.event_starts_at ? `${new Date(event.event_starts_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })} IST · ` : ""}{event.venue ? `${event.venue} · ` : ""}{event.total_inventory} seats</p><div className="mt-5 flex gap-5 text-sm font-bold"><Link href={`/admin/events/${event.id}`} className="text-blue-700">Manage event →</Link><Link href={`/event/${event.id}`} className="text-slate-700">Attendee page ↗</Link></div></article>)}</div></section>
    </main></div>;
}
