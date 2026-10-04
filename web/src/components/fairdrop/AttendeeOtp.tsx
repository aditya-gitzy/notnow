"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { RecaptchaWidget } from "./RecaptchaWidget";

export function AttendeeOtp({ siteKey, configured }: { siteKey: string | null; configured: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [sent, setSent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [resetCount, setResetCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch(sent ? "/api/auth/otp/verify" : "/api/auth/otp/request", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sent ? { email, token } : { email, mode, captchaToken }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Authentication failed.");
      if (sent) { router.push("/events"); router.refresh(); }
      else { setSent(true); setMessage("Check your email for a one-time code."); }
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Please try again."); }
    finally { setBusy(false); if (!sent) { setCaptchaToken(""); setResetCount((value) => value + 1); } }
  }

  return <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
    <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-600">Attendee access</p>
    <h2 className="display mt-3 text-4xl">{sent ? "Verify your email." : "Enter the event."}</h2>
    <p className="mt-4 text-slate-600">{sent ? `Enter the one-time code sent to ${email}.` : "Use your email to sign up or log in. Your place is saved to your account."}</p>
    {!configured && <p role="alert" className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Supabase Auth needs its publishable key in web/.env.local to send email codes.</p>}
    {!sent && <div className="mt-6 flex gap-2" role="group" aria-label="Attendee authentication mode">
      {(["signup", "login"] as const).map((option) => <button key={option} type="button" onClick={() => setMode(option)} aria-pressed={mode === option} className={`rounded-lg px-4 py-2 text-sm font-bold ${mode === option ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}>{option === "signup" ? "Sign up" : "Log in"}</button>)}
    </div>}
    <form onSubmit={submit} className="mt-6 space-y-4">
      <label className="block text-sm font-bold" htmlFor="attendee-email">Email address</label>
      <input id="attendee-email" type="email" autoComplete="email" required disabled={sent} value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-lg border border-slate-300 px-4 py-3 disabled:bg-slate-50" />
      {sent ? <><label className="block text-sm font-bold" htmlFor="attendee-code">One-time code</label><input id="attendee-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" required value={token} onChange={(event) => setToken(event.target.value)} className="w-full rounded-lg border border-slate-300 px-4 py-3" /></>
        : <RecaptchaWidget siteKey={siteKey} onToken={setCaptchaToken} resetCount={resetCount} />}
      <button type="submit" disabled={busy || !configured || (!sent && !captchaToken)} className="w-full bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? "Please wait…" : sent ? "Verify and continue" : "Email me a code"}</button>
    </form>
    {sent && <button type="button" className="mt-4 text-sm font-semibold text-blue-700 underline" onClick={() => { setSent(false); setToken(""); setMessage(""); }}>Use another email or request a new code</button>}
    {message && <p role="status" className="mt-4 text-sm text-blue-800">{message}</p>}
  </section>;
}
