"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RecaptchaWidget } from "./RecaptchaWidget";

export function DemoAccountPicker({ accounts, currentId, siteKey, afterChoose = "refresh", eventId }: { accounts: { id: string; displayName: string }[]; currentId: string | null; siteKey: string | null; afterChoose?: "refresh" | "home"; eventId?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [resetCount, setResetCount] = useState(0);
  async function choose(accountId: string) {
    setPending(accountId); setError("");
    try {
      const response = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId, captchaToken }) });
      if (!response.ok) throw new Error("Unable to select this account. Please complete reCAPTCHA again.");
      if (afterChoose === "home") router.push(eventId ? `/event/${eventId}` : "/events"); else router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to select account."); }
    finally { setPending(null); setCaptchaToken(""); setResetCount((count) => count + 1); }
  }
  return <div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
    {accounts.map((account) => <button key={account.id} type="button" onClick={() => choose(account.id)} disabled={!!pending || !captchaToken}
      className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${currentId === account.id ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white hover:border-blue-400"}`}>
      <span className="block">{account.displayName}</span><span className="text-xs font-normal text-slate-500">{pending === account.id ? "Selecting…" : currentId === account.id ? "Selected" : "Demo buyer"}</span>
    </button>)}
  </div><div className="mt-5"><RecaptchaWidget siteKey={siteKey} onToken={setCaptchaToken} resetCount={resetCount} /></div><p className="mt-3 text-xs text-slate-500">Complete reCAPTCHA, then choose a demo attendee.</p>{error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}</div>;
}
