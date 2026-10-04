import { NextResponse } from "next/server";
import { validateAttackConfig } from "@/lib/attack-config";
import { createAttackRun, getAttackRun } from "@/lib/attack-runs";
import { launchAttackRun, recoverInterruptedAttackRun } from "@/lib/attack-simulator";
import { organizerSession } from "@/lib/session";

export const runtime = "nodejs";
function internalOrigin(request: Request) {
  const url = new URL(request.url);
  return process.env.LAB_BASE_URL ?? (["localhost", "127.0.0.1", "::1"].includes(url.hostname) ? url.origin : null);
}
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await organizerSession())) return NextResponse.json({ reasonCode: "UNAUTHORIZED" }, { status: 403 });
  const eventId = (await context.params).id;
  await recoverInterruptedAttackRun(eventId);
  const run = await getAttackRun(eventId);
  return NextResponse.json(run ?? { reasonCode: "ATTACK_RUN_NOT_FOUND" },
    { status: run ? 200 : 404, headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await organizerSession())) return NextResponse.json({ reasonCode: "UNAUTHORIZED" }, { status: 403 });
  const origin = internalOrigin(request);
  if (!origin) return NextResponse.json({ reasonCode: "SIMULATOR_LOCAL_ONLY" }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ reasonCode: "INVALID_BODY" }, { status: 400 }); }
  const config = validateAttackConfig(body);
  if (!config) return NextResponse.json({ reasonCode: "INVALID_CONFIG" }, { status: 400 });
  const created = await createAttackRun((await context.params).id, config);
  if (!created.ok || !created.eventId) return NextResponse.json(created, { status: 404 });
  const launched = await launchAttackRun(created.eventId, origin);
  return NextResponse.json({ ...launched, eventId: created.eventId, runId: created.runId },
    { status: launched.ok ? 202 : 409, headers: { "Cache-Control": "no-store" } });
}
