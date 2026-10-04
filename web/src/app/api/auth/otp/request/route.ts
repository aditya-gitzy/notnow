import { NextResponse } from "next/server";
import { supabaseAuth } from "@/lib/supabase-auth";
import { verifyRecaptcha } from "@/lib/recaptcha";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = supabaseAuth();
  if (!auth) return NextResponse.json({ message: "Supabase Auth key is not configured." }, { status: 503 });
  let body: { email?: unknown; mode?: unknown; captchaToken?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Invalid request." }, { status: 400 }); }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !["signup", "login"].includes(String(body.mode)))
    return NextResponse.json({ message: "Enter a valid email and choose sign up or log in." }, { status: 400 });
  const captcha = await verifyRecaptcha(body.captchaToken, request);
  if (!captcha.ok) return NextResponse.json({ message: "Complete reCAPTCHA and try again." }, { status: 403 });
  // Supabase limits repeated code requests and sends the OTP email.
  const { error } = await auth.auth.signInWithOtp({ email, options: { shouldCreateUser: body.mode === "signup" } });
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
