import { NextResponse } from "next/server";
import { getAttackHistory } from "@/lib/attack-runs";
import { organizerSession } from "@/lib/session";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await organizerSession())) return NextResponse.json({ reasonCode: "UNAUTHORIZED" }, { status: 403 });
  const runs = await getAttackHistory((await context.params).id);
  return NextResponse.json({ runs }, { headers: { "Cache-Control": "no-store" } });
}
