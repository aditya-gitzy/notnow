"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { RecaptchaWidget } from "./RecaptchaWidget";

export function AdminLogin({ siteKey }: { siteKey: string | null }) {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [resetCount, setResetCount] = useState(0);
  async function submit(event: FormEvent) {
    event.preventDefault(); setPending(true); setError("");
    try {
      const response = await fetch("/api/admin/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ secret, captchaToken }) });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.reasonCode === "ADMIN_NOT_CONFIGURED" ? "Set ADMIN_SECRET in web/.env.local and restart the app." : data.reasonCode?.startsWith("RECAPTCHA") ? "Please complete reCAPTCHA again." : "Organizer secret was not accepted.");
      }
      setSecret(""); router.push("/admin/events"); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to sign in."); }
    finally { setPending(false); setCaptchaToken(""); setResetCount((count) => count + 1); }
  }
  return <section className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"><p className="text-xs font-bold uppercase tracking-[.18em] text-blue-600">Organiser access</p><h1 className="display mt-3 text-4xl">Run the sale.</h1><p className="mt-4 text-slate-600">Use the local organiser secret to control entry and admission, review live metrics, and start a fresh demo.</p><form onSubmit={submit} className="mt-7 space-y-4"><label htmlFor="admin-secret" className="block text-sm font-bold">Organiser secret</label><input id="admin-secret" type="password" autoComplete="current-password" required value={secret} onChange={(event) => setSecret(event.target.value)} className="w-full rounded-lg border border-slate-300 px-4 py-3" /><RecaptchaWidget siteKey={siteKey} onToken={setCaptchaToken} resetCount={resetCount} /><button type="submit" disabled={pending || !captchaToken} className="w-full bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-700 disabled:opacity-60">{pending ? "Signing in…" : "Open organiser console"}</button>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}</form></section>;
}
