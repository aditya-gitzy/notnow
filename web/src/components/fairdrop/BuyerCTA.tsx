"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BuyerState, EventRow } from "@/lib/event";
import { getBuyerAction } from "@/lib/buyer-action";
import { RecaptchaWidget } from "./RecaptchaWidget";

export function BuyerCTA({ event, buyer, light = false, queueHref = "/waiting-room", authHref = "/auth", joinHref, challengeSiteKey }: { event: EventRow; buyer: BuyerState; light?: boolean; queueHref?: string; authHref?: string; joinHref?: string; challengeSiteKey?: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [resetCount, setResetCount] = useState(0);
  const action = getBuyerAction(event, buyer);
  const actionHref = action.href === "/auth" ? authHref
    : event.access_mode === "PROTECTED" ? queueHref
    : action.href && ["/waiting-room", "/waitlist", "/confirm", "/ticket"].includes(action.href)
      ? `${action.href}?event=${event.id}` : action.href;
  const cls = `inline-flex min-h-12 items-center justify-center px-6 py-3 text-sm font-bold uppercase tracking-[.12em] transition-colors ${light ? "bg-white text-blue-700 hover:bg-blue-50" : "bg-blue-600 text-white hover:bg-blue-700"}`;

  async function join() {
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/events/${event.id}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ captchaToken }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.reasonCode ?? "Unable to join");
      router.push(queueHref);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to join");
    } finally { setPending(false); setCaptchaToken(""); setResetCount((value) => value + 1); }
  }

  return <span className="inline-flex flex-col items-start gap-2">
    {action.href || (action.join && joinHref) ? <Link href={action.join && joinHref ? joinHref : actionHref!} className={cls}>{buyer.state === "NOT_SIGNED_IN" && event.access_mode === "PROTECTED" ? "Claim invitation or sign in" : action.label} <span aria-hidden className="ml-3">↗</span></Link>
      : <>{action.join && challengeSiteKey !== undefined && <RecaptchaWidget siteKey={challengeSiteKey} onToken={setCaptchaToken} resetCount={resetCount} />}<button type="button" onClick={join} disabled={pending || action.disabled || (action.join && challengeSiteKey !== undefined && !captchaToken)} className={`${cls} disabled:opacity-60`}>{pending ? "Joining…" : action.label} <span aria-hidden className="ml-3">↗</span></button></>}
    {error && <span role="alert" className="rounded bg-red-50 px-2 py-1 text-xs text-red-700">{error}</span>}
  </span>;
}
