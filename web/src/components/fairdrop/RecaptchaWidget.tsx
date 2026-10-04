"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

type CaptchaApi = { render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void; "expired-callback": () => void }) => number; reset: (id: number) => void };
declare global { interface Window { grecaptcha?: CaptchaApi } }

export function RecaptchaWidget({ siteKey, onToken, resetCount }: { siteKey: string | null; onToken: (token: string) => void; resetCount: number }) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<number | null>(null);
  const callback = useRef(onToken);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => { callback.current = onToken; }, [onToken]);
  const render = useCallback(() => {
    if (!siteKey || !container.current || typeof window.grecaptcha?.render !== "function" || widgetId.current !== null) return;
    widgetId.current = window.grecaptcha.render(container.current, { sitekey: siteKey,
      callback: (token) => callback.current(token), "expired-callback": () => callback.current("") });
    setLoaded(true);
  }, [siteKey]);
  useEffect(() => {
    // api.js loads the full reCAPTCHA implementation asynchronously. The
    // script load event can fire before grecaptcha.render becomes available.
    const timer = window.setInterval(render, 250);
    const timeout = window.setTimeout(() => setLoadFailed(widgetId.current === null), 10000);
    return () => { window.clearInterval(timer); window.clearTimeout(timeout); };
  }, [render]);
  useEffect(() => {
    if (resetCount > 0 && widgetId.current !== null) { window.grecaptcha?.reset(widgetId.current); callback.current(""); }
  }, [resetCount]);
  if (!siteKey) return <p className="text-sm font-semibold text-amber-800">reCAPTCHA keys are not configured. Set them in web/.env.local.</p>;
  return <div className="space-y-2"><Script src="https://www.google.com/recaptcha/api.js?render=explicit" strategy="afterInteractive" onReady={render} onError={() => setLoadFailed(true)} /><div ref={container} />{!loaded && <p className="text-sm text-slate-500">{loadFailed ? "reCAPTCHA could not load. Check your connection and reload the page." : "Loading reCAPTCHA…"}</p>}<p className="text-xs text-slate-500">{siteKey === "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI" ? "Google test reCAPTCHA: this demo key does not stop bots." : "Protected by Google reCAPTCHA."}</p></div>;
}
