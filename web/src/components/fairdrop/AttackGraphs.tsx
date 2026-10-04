"use client";

import { RollingValue } from "./RollingValue";

type Point = { at: string; humanEntries: number; botEntries: number; blockedRequests: number };
type GraphData = { timeline: Point[]; seatsAllocated: number; seatsWonByBots: number; seatsRemaining: number };

const series = [
  { key: "humanEntries" as const, label: "Human entries", color: "#16a34a" },
  { key: "botEntries" as const, label: "Bot entries", color: "#2563eb" },
  { key: "blockedRequests" as const, label: "Blocked requests", color: "#e11d48" },
];

export function AttackGraphs({ data, running }: { data: GraphData | null; running: boolean }) {
  return <div className="mt-6 grid gap-6 lg:grid-cols-[1.45fr_.8fr]">
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold">Attack over time</h2>{running && <span className="flex items-center gap-2 text-xs font-bold text-blue-700"><span aria-hidden="true" className="live-pulse h-2 w-2 rounded-full bg-blue-600" /> Collecting live samples</span>}</div>
      <p className="mt-1 text-sm text-slate-500">Measured live counters; saved audit history restores the graph after a refresh.</p>
      <TrafficChart points={data?.timeline ?? []} running={running} />
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-slate-700">{series.map((item) => <span key={item.key} className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span>)}</div>
      <p className="mt-3 text-xs text-slate-500">A bot can make several rejected requests, so blocked requests may exceed the number of bots.</p>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-bold">Who got the seats?</h2>
      <p className="mt-1 text-sm text-slate-500">Current allocations and remaining inventory.</p>
      <SeatDonut data={data} />
    </section>
  </div>;
}

function TrafficChart({ points, running }: { points: Point[]; running: boolean }) {
  if (!points.length) return <div className="mt-6 flex h-[260px] items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">Launch an attack to see the traffic graph.</div>;
  const first = new Date(points[0].at).getTime();
  const last = new Date(points[points.length - 1].at).getTime();
  const chartPoints = points.length === 1 ? [
    { at: new Date(first - 1000).toISOString(), humanEntries: 0, botEntries: 0, blockedRequests: 0 }, ...points,
  ] : points;
  const maximum = Math.max(1, ...chartPoints.flatMap((point) => series.map((item) => point[item.key])));
  const left = 45, right = 585, top = 18, bottom = 208;
  const x = (at: string) => left + (new Date(at).getTime() - new Date(chartPoints[0].at).getTime()) /
    Math.max(1000, last - new Date(chartPoints[0].at).getTime()) * (right - left);
  const y = (value: number) => bottom - value / maximum * (bottom - top);
  const time = (value: number) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return <svg viewBox="0 0 620 260" className="mt-6 w-full" role="img" aria-label={`Traffic over time: ${points.at(-1)?.humanEntries ?? 0} human entries, ${points.at(-1)?.botEntries ?? 0} bot entries, ${points.at(-1)?.blockedRequests ?? 0} blocked requests`}>
    {[0, .25, .5, .75, 1].map((fraction) => <g key={fraction}><line x1={left} x2={right} y1={y(maximum * fraction)} y2={y(maximum * fraction)} stroke="#e2e8f0" /><text x={left - 9} y={y(maximum * fraction) + 4} textAnchor="end" fill="#64748b" fontSize="11">{Math.round(maximum * fraction)}</text></g>)}
    {series.map((item) => <g key={item.key}><polyline fill="none" stroke={item.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={chartPoints.map((point) => `${x(point.at)},${y(point[item.key])}`).join(" ")} />{running && chartPoints.length > 1 && <line className="graph-tail" x1={x(chartPoints.at(-2)!.at)} y1={y(chartPoints.at(-2)![item.key])} x2={x(chartPoints.at(-1)!.at)} y2={y(chartPoints.at(-1)![item.key])} stroke={item.color} strokeWidth="4" strokeLinecap="round" />}<circle cx={x(chartPoints.at(-1)!.at)} cy={y(chartPoints.at(-1)![item.key])} r="4" fill={item.color} style={{ transition: "cx .6s ease, cy .6s ease" }} /></g>)}
    <text x={left} y="244" fill="#64748b" fontSize="11">{time(first)}</text><text x={right} y="244" fill="#64748b" fontSize="11" textAnchor="end">{time(last)}</text>
  </svg>;
}

function SeatDonut({ data }: { data: GraphData | null }) {
  if (!data) return <div className="mt-6 flex h-52 items-center justify-center text-sm text-slate-500">Loading seat data…</div>;
  const botSeats = data.seatsWonByBots;
  const humanSeats = Math.max(0, data.seatsAllocated - botSeats);
  const remaining = data.seatsRemaining;
  const total = Math.max(1, botSeats + humanSeats + remaining);
  const circumference = 2 * Math.PI * 58;
  const botArc = botSeats / total * circumference;
  const humanArc = humanSeats / total * circumference;
  return <><div className="relative mx-auto mt-5 h-48 w-48"><svg viewBox="0 0 160 160" className="h-full w-full -rotate-90" role="img" aria-label={`${botSeats} seats won by bots, ${humanSeats} by humans, ${remaining} remaining`}><circle cx="80" cy="80" r="58" fill="none" stroke="#e2e8f0" strokeWidth="19" /><circle cx="80" cy="80" r="58" fill="none" stroke="#2563eb" strokeWidth="19" strokeDasharray={`${botArc} ${circumference - botArc}`} style={{ transition: "stroke-dasharray .6s ease" }} /><circle cx="80" cy="80" r="58" fill="none" stroke="#16a34a" strokeWidth="19" strokeDasharray={`${humanArc} ${circumference - humanArc}`} strokeDashoffset={-botArc} style={{ transition: "stroke-dasharray .6s ease, stroke-dashoffset .6s ease" }} /></svg><div className="absolute inset-0 flex flex-col items-center justify-center"><span className="display text-4xl tabular"><RollingValue value={String(data.seatsAllocated)} /></span><span className="text-xs font-semibold text-slate-500">allocated</span></div></div><ul className="mt-4 space-y-2 text-sm">{[["Bots", botSeats, "#2563eb"], ["Humans", humanSeats, "#16a34a"], ["Remaining", remaining, "#cbd5e1"]].map(([label, value, color]) => <li key={String(label)} className="flex items-center justify-between"><span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: String(color) }} />{label}</span><strong className="tabular"><RollingValue value={String(value)} /></strong></li>)}</ul></>;
}
