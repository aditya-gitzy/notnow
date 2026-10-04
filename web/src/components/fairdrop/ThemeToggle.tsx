"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    document.body.dataset.theme = saved;
    setTheme(saved);
  }, []);

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.body.dataset.theme = next;
    try { localStorage.setItem("fairdrop-theme", next); } catch { /* Private browsing can block storage. */ }
    setTheme(next);
  }

  return <button type="button" onClick={toggleTheme} aria-label={`Current theme: ${theme}. Switch to ${theme === "dark" ? "light" : "dark"} mode`} aria-pressed={theme === "dark"} className="theme-toggle fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full border px-4 py-3 text-sm font-bold shadow-lg" suppressHydrationWarning>
    {theme === "dark" ? <Moon aria-hidden="true" size={18} /> : <Sun aria-hidden="true" size={18} />}
    <span>{theme === "dark" ? "Dark theme" : "Light theme"}</span>
  </button>;
}
