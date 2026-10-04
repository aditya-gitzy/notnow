import { NextResponse } from "next/server";
import { resetAttackRun } from "@/lib/attack-runs";
import { organizerSession } from "@/lib/session";

export const runtime = "nodejs";
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await organizerSession())) return NextResponse.json({ reasonCode: "UNAUTHORIZED" }, { status: 403 });
  const result = await resetAttackRun((await context.params).id);
  return NextResponse.json(result, { status: result.ok ? 200 : result.reasonCode === "ATTACK_RUN_NOT_FOUND" ? 404 : 409,
    headers: { "Cache-Control": "no-store" } });
}
