import { NextResponse } from "next/server";
import { launchAttackRun } from "@/lib/attack-simulator";
import { organizerSession } from "@/lib/session";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await organizerSession())) return NextResponse.json({ reasonCode: "UNAUTHORIZED" }, { status: 403 });
  const url = new URL(request.url);
  const origin = process.env.LAB_BASE_URL ?? (["localhost", "127.0.0.1", "::1"].includes(url.hostname) ? url.origin : null);
  if (!origin) return NextResponse.json({ reasonCode: "SIMULATOR_LOCAL_ONLY" }, { status: 503 });
  const result = await launchAttackRun((await context.params).id, origin);
  return NextResponse.json(result, { status: result.ok ? 202 : 409, headers: { "Cache-Control": "no-store" } });
}
