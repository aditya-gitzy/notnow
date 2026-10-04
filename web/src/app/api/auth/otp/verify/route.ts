import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { setBuyerSession } from "@/lib/session";
import { supabaseAuth } from "@/lib/supabase-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = supabaseAuth();
  if (!auth) return NextResponse.json({ message: "Supabase Auth key is not configured." }, { status: 503 });
  let body: { email?: unknown; token?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Invalid request." }, { status: 400 }); }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6,8}$/.test(token))
    return NextResponse.json({ message: "Enter the code from your email." }, { status: 400 });
  const { data, error } = await auth.auth.verifyOtp({ email, token, type: "email" });
  if (error || !data.user?.id || data.user.email?.toLowerCase() !== email)
    return NextResponse.json({ message: "Code is invalid or expired." }, { status: 401 });
  const accountId = `supabase:${data.user.id}`;
  const db = await getDb();
  await db.query(
    "INSERT INTO demo_accounts (id,display_name,role,auth_kind) VALUES ($1,$2,'buyer','EMAIL_OTP') ON CONFLICT (id) DO NOTHING",
    [accountId, `Verified attendee ${data.user.id}`],
  );
  await setBuyerSession(accountId);
  return NextResponse.json({ ok: true });
}
