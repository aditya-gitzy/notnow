import { NextResponse } from "next/server";
import { getDemoPolicy, parseDemoPolicy, updateDemoPolicy } from "@/lib/demo-policy";
import { organizerSession } from "@/lib/session";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await organizerSession())) return NextResponse.json({ reasonCode: "UNAUTHORIZED" }, { status: 403 });
  const policy = await getDemoPolicy((await context.params).id);
  return NextResponse.json(policy ? { ok: true, policy } : { reasonCode: "DEMO_RUN_REQUIRED" },
    { status: policy ? 200 : 404, headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await organizerSession())) return NextResponse.json({ reasonCode: "UNAUTHORIZED" }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ reasonCode: "INVALID_BODY" }, { status: 400 }); }
  const result = await updateDemoPolicy((await context.params).id, parseDemoPolicy(body));
  return NextResponse.json(result, { status: result.ok ? 200 : result.reasonCode === "INVALID_POLICY" ? 400 : 409 });
}
