import { JourneyExperience } from "@/components/fairdrop/JourneyExperience";
import { journeyEventId } from "@/lib/attendee-events";
import { buyerAccountId } from "@/lib/session";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function WaitlistPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) { if (!(await buyerAccountId())) redirect("/auth"); return <JourneyExperience eventId={await journeyEventId((await searchParams).event)} stage="waitlist" />; }
