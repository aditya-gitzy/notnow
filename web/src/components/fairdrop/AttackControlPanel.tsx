"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AttackControlPanel({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [bots, setBots] = useState(500);
  const [humans, setHumans] = useState(500);
  const [seats, setSeats] = useState(500);
  const [rps, setRps] = useState(2);
  const [fakeIdentities, setFakeIdentities] = useState(500);
  const [retryBehavior, setRetryBehavior] = useState("none");
  const [challengeStrategy, setChallengeStrategy] = useState("ignore");
  const [seed, setSeed] = useState("judge-demo-01");
  const [rate, setRate] = useState(true);
  const [identity, setIdentity] = useState(true);
  const [challenge, setChallenge] = useState(true);
  const [mode, setMode] = useState("RANDOM");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function launch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/events/${eventId}/attack/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        seed, bots, humans, seats, requestsPerSecondPerBot: rps, fakeIdentities, retryBehavior, challengeStrategy,
        maxConcurrency: 32, defenses: { rateLimitEnabled: rate, identityLimitEnabled: identity,
          challengeEnabled: challenge, allocationMode: mode },
      }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.reasonCode === "INVALID_CONFIG" ? "Check the field ranges and keep scheduled requests under 12,000." : data.reasonCode ?? "Attack could not start");
      router.push(`/admin/events/${data.eventId}/attack/live`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Attack could not start"); setBusy(false); }
  }
  return <>
    <p className="text-xs font-bold uppercase tracking-[.2em] text-blue-600">Judge demo · attack setup</p><h1 className="display mt-3 text-4xl sm:text-5xl">Launch a bot attack.</h1><p className="mt-4 max-w-3xl leading-relaxed text-slate-600">This simulator sends real requests to this local app. Every run gets a fresh event and saves its measured results. Keep the same attack inputs and seed while changing defenses to compare fairly.</p>
    <form onSubmit={(e) => void launch(e)} className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_.8fr]"><section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-bold">Attack inputs</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Number of bots" min={1} max={3000} value={bots} set={setBots} /><Field label="Human buyers" min={1} max={1000} value={humans} set={setHumans} /><Field label="Seats" min={1} max={500} value={seats} set={setSeats} /><Field label="Requests / second / bot" min={1} max={20} value={rps} set={setRps} /><Field label="Fake identities" min={1} max={bots} value={fakeIdentities} set={setFakeIdentities} /><label className="text-sm font-semibold">Fixed random seed<input required pattern="[a-zA-Z0-9_-]{3,40}" value={seed} onChange={(e) => setSeed(e.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 p-3" /></label><label className="text-sm font-semibold">Retry behavior<select value={retryBehavior} onChange={(e) => setRetryBehavior(e.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 p-3"><option value="none">No retries</option><option value="repeat">Repeat attempts</option><option value="aggressive">Aggressive retries</option></select></label><label className="text-sm font-semibold">Bot challenge behavior<select value={challengeStrategy} onChange={(e) => setChallengeStrategy(e.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 p-3"><option value="ignore">Ignore challenge</option><option value="solve">Solve challenge</option></select></label></div><p className="mt-5 text-sm text-slate-500">One local run can schedule up to 12,000 joins. A few thousand bots may take longer than a few seconds on this laptop.</p></section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-bold">Defenses for this run</h2><div className="mt-5 space-y-4 text-sm font-semibold"><Check label="Rate limiting" value={rate} set={setRate} /><Check label="One entry per identity" value={identity} set={setIdentity} /><Check label="Bot challenge" value={challenge} set={setChallenge} /><label className="block">Allocation mode<select value={mode} onChange={(e) => setMode(e.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 p-3"><option value="RANDOM">Random draw</option><option value="FIRST_COME">First come, first served</option></select></label></div><p className="mt-6 text-sm leading-relaxed text-slate-500">The challenge is deliberately simple. Bots set to “Solve challenge” can pass it; compare that run to show its limits honestly.</p><button disabled={busy} className="mt-7 w-full rounded-lg bg-blue-600 px-5 py-4 text-sm font-bold text-white disabled:opacity-50">{busy ? "Starting real requests…" : "Launch attack"}</button>{error && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{error}</p>}</section></form>
    <Link href={`/admin/events/${eventId}/attack/results`} className="mt-6 inline-block text-sm font-bold text-blue-700">View saved comparison results →</Link>
  </>;
}
function Field({ label, min, max, value, set }: { label: string; min: number; max: number; value: number; set: (value: number) => void }) { return <label className="text-sm font-semibold">{label}<input type="number" required min={min} max={max} value={value} onChange={(e) => set(Number(e.target.value))} className="mt-2 block w-full rounded-lg border border-slate-300 p-3" /></label>; }
function Check({ label, value, set }: { label: string; value: boolean; set: (value: boolean) => void }) { return <label className="flex items-center justify-between gap-3">{label}<input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} className="h-5 w-5 accent-blue-600" /></label>; }
