import { NextResponse } from "next/server";
import { buyerAccountId } from "@/lib/session";
import { issueDemoChallenge } from "@/lib/demo-challenge";
import { consumeBuyerLimit } from "@/lib/abuse";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const accountId = await buyerAccountId();
  if (!accountId) return NextResponse.json({ reasonCode: "NOT_SIGNED_IN" }, { status: 401 });
  const id = (await context.params).id;
  // Issuing challenges also consumes the join budget so bots cannot fill the
  // challenge table by repeatedly asking for fresh puzzles.
  const limited = await consumeBuyerLimit(id, accountId, "join", request);
  if (limited) return NextResponse.json(limited, { status: 429, headers: { "Retry-After": String(limited.retryAfter) } });
  const result = await issueDemoChallenge(id, accountId);
  return NextResponse.json(result, { status: result.ok ? 200 : 409, headers: { "Cache-Control": "no-store" } });
}
