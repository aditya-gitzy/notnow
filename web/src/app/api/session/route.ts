import { NextResponse } from "next/server";
import { getDemoAccounts } from "@/lib/event";
import { setBuyerSession } from "@/lib/session";
import { verifyRecaptcha } from "@/lib/recaptcha";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ reasonCode: "INVALID_REQUEST" }, { status: 400 }); }
  const accountId = typeof body === "object" && body !== null && "accountId" in body ? (body as { accountId: unknown }).accountId : null;
  if (typeof accountId !== "string") return NextResponse.json({ reasonCode: "INVALID_ACCOUNT" }, { status: 400 });
  const account = (await getDemoAccounts()).find((item) => item.id === accountId);
  if (!account) return NextResponse.json({ reasonCode: "INVALID_ACCOUNT" }, { status: 400 });
  const captcha = await verifyRecaptcha((body as { captchaToken?: unknown }).captchaToken, request);
  if (!captcha.ok) return NextResponse.json({ reasonCode: captcha.reasonCode }, { status: captcha.reasonCode === "RECAPTCHA_NOT_CONFIGURED" ? 503 : 403 });
  await setBuyerSession(account.id);
  return NextResponse.json({ account });
}
