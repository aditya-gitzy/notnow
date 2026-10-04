import { NextResponse } from "next/server";
import { createListedEvent, type NewEvent } from "@/lib/event-creation";
import { organizerSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await organizerSession())) return NextResponse.json({ message: "Organiser sign-in required." }, { status: 403 });
  let body: Partial<NewEvent>;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Invalid event details." }, { status: 400 }); }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const opens = typeof body.opensAt === "string" ? Date.parse(body.opensAt) : NaN;
  const closes = typeof body.closesAt === "string" ? Date.parse(body.closesAt) : NaN;
  const eventStarts = typeof body.eventStartsAt === "string" ? Date.parse(body.eventStartsAt) : NaN;
  const venue = typeof body.venue === "string" ? body.venue.trim() : "";
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  const seats = body.seats;
  const batchSize = body.batchSize;
  const holdMinutes = body.holdMinutes;
  if (name.length < 3 || name.length > 120 || venue.length < 2 || venue.length > 120
    || !Number.isFinite(opens) || !Number.isFinite(closes) || !Number.isFinite(eventStarts)
    || opens < Date.now() - 24 * 60 * 60 * 1000 || closes <= Math.max(opens, Date.now())
    || eventStarts < closes || eventStarts > closes + 365 * 24 * 60 * 60 * 1000
    || closes - opens > 90 * 24 * 60 * 60 * 1000
    || imageUrl.length > 500 || (imageUrl && (!URL.canParse(imageUrl) || new URL(imageUrl).protocol !== "https:"))
    || !Number.isInteger(seats) || seats! < 1 || seats! > 100000
    || !Number.isInteger(batchSize) || batchSize! < 1 || batchSize! > seats!
    || !Number.isInteger(holdMinutes) || holdMinutes! < 1 || holdMinutes! > 30)
    return NextResponse.json({ message: "Check the event details, dates, image URL, and seat settings." }, { status: 400 });
  const id = await createListedEvent({ name, opensAt: new Date(opens).toISOString(), closesAt: new Date(closes).toISOString(),
    eventStartsAt: new Date(eventStarts).toISOString(), venue, imageUrl: imageUrl || null,
    seats: seats!, batchSize: batchSize!, holdMinutes: holdMinutes! });
  return NextResponse.json({ ok: true, eventId: id }, { status: 201 });
}
