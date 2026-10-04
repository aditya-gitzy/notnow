import { NextResponse } from "next/server";
import { getEvent, joinQueue } from "@/lib/event";
import { buyerAccountId } from "@/lib/session";
import { auditDecision, consumeBuyerLimit } from "@/lib/abuse";
import { verifyRecaptcha } from "@/lib/recaptcha";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const event = await getEvent(id);
  if (!event) return NextResponse.json({ reasonCode: "EVENT_NOT_FOUND", message: "Event not found." }, { status: 404 });
  const accountId = await buyerAccountId();
  if (!accountId) return NextResponse.json({ reasonCode: "NOT_SIGNED_IN", message: "Sign in as an attendee first." }, { status: 401 });
  const limited = await consumeBuyerLimit(id, accountId, "join", request);
  if (limited) return NextResponse.json(limited, { status: 429, headers: { "Retry-After": String(limited.retryAfter) } });
  // Empty bodies remain valid for the existing sale. Demo challenge runs send
  // a one-use challenge ID and its proof-of-work answer in JSON.
  let challenge: { challengeId?: unknown; answer?: unknown; captchaToken?: unknown } | undefined;
  try {
    const raw = await request.text();
    if (raw) {
      // reCAPTCHA tokens can exceed the old proof-of-work-only body limit.
      if (raw.length > 4096) return NextResponse.json({ reasonCode: "INVALID_BODY" }, { status: 400 });
      challenge = JSON.parse(raw) as typeof challenge;
    }
  } catch { return NextResponse.json({ reasonCode: "INVALID_BODY" }, { status: 400 }); }
  if (event.access_mode === "DEMO" && !event.simulation_run_id) {
    const captcha = await verifyRecaptcha(challenge?.captchaToken, request);
    if (!captcha.ok) {
      await auditDecision(id, accountId, "REQUEST_REJECTED", captcha.reasonCode ?? "CHALLENGE_FAILED");
      return NextResponse.json({ reasonCode: captcha.reasonCode, message: "Complete the challenge before joining." }, { status: 403 });
    }
  }
  const result = await joinQueue(event.id, accountId, challenge);
  if (!result.ok) await auditDecision(id, accountId, "REQUEST_REJECTED", result.reasonCode);
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
