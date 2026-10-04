"use client";

import { useEffect, useState } from "react";

export function EntryCountdown({ closesAt }: { closesAt: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (now === null) return <span>Calculating…</span>;
  const seconds = Math.max(0, Math.ceil((new Date(closesAt).getTime() - now) / 1000));
  if (seconds === 0) return <span>Entry window closed</span>;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return <span>{hours > 0 ? `${hours}h ` : ""}{minutes}m {String(seconds % 60).padStart(2, "0")}s</span>;
}
