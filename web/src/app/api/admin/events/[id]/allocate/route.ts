import { NextResponse } from "next/server";
import { allocateDemoSeats } from "@/lib/demo-allocation";
import { organizerSession } from "@/lib/session";

export const runtime = "nodejs";
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await organizerSession())) return NextResponse.json({ reasonCode: "UNAUTHORIZED" }, { status: 403 });
  const result = await allocateDemoSeats((await context.params).id);
  return NextResponse.json(result, { status: result.ok ? 200 : 409, headers: { "Cache-Control": "no-store" } });
}
