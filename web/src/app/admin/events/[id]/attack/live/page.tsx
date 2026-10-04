import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AttackDashboard } from "@/components/fairdrop/AttackDashboard";
import { getAttackRun } from "@/lib/attack-runs";
import { organizerSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export default async function AttackLivePage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await organizerSession())) redirect("/admin");
  const { id } = await params;
  const run = await getAttackRun(id);
  if (!run) notFound();
  return <div className="min-h-screen bg-slate-50"><header className="border-b border-slate-200 bg-white"><div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-5"><Link href={run.sourceEventId ? `/admin/events/${run.sourceEventId}/attack` : "/admin"} className="display text-2xl italic uppercase text-blue-600">Fair Drop<span className="text-slate-900">.</span></Link><span className="text-xs font-bold uppercase tracking-widest text-slate-500">Bot attack demo</span></div></header><main className="mx-auto max-w-6xl px-5 py-12"><AttackDashboard eventId={id} /></main></div>;
}
