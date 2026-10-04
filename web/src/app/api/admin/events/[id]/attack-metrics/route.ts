import { NextResponse } from "next/server";
import { demoAttackMetrics, demoAttackTimeline } from "@/lib/demo-metrics";
import { organizerSession } from "@/lib/session";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await organizerSession())) return NextResponse.json({ reasonCode: "UNAUTHORIZED" }, { status: 403 });
  const eventId = (await context.params).id;
  if (new URL(request.url).searchParams.get("view") === "timeline") {
    return NextResponse.json({ timeline: await demoAttackTimeline(eventId) }, { headers: { "Cache-Control": "no-store" } });
  }
  const metrics = await demoAttackMetrics(eventId, false);
  return NextResponse.json(metrics ?? { reasonCode: "DEMO_RUN_REQUIRED" },
    { status: metrics ? 200 : 404, headers: { "Cache-Control": "no-store" } });
}
