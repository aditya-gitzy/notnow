import Link from "next/link";
import { RoleAccess } from "@/components/fairdrop/RoleAccess";
import { getDemoAccounts } from "@/lib/event";
import { recaptchaSiteKey } from "@/lib/recaptcha";
import { buyerAccountId, organizerSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export default async function AuthPage() {
  const [accounts, attendee, organiser] = await Promise.all([getDemoAccounts(), buyerAccountId(), organizerSession()]);
  return <div className="min-h-screen bg-slate-50"><header className="border-b border-slate-200 bg-white"><div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-5"><Link href="/auth" className="display text-2xl italic uppercase text-blue-600">Fair Drop<span className="text-slate-900">.</span></Link><Link href="/about" className="text-sm font-bold text-blue-700">How it works</Link></div></header>
    {(attendee || organiser) && <nav aria-label="Continue signed-in session" className="mx-auto mt-6 flex max-w-6xl flex-wrap items-center gap-3 px-5 text-sm"><span className="font-semibold text-slate-700">Already signed in?</span>{attendee && <Link href="/events" className="rounded-lg bg-blue-600 px-4 py-2 font-bold text-white">Continue as attendee</Link>}{organiser && <Link href="/admin/events" className="rounded-lg border border-blue-600 px-4 py-2 font-bold text-blue-700">Continue as organiser</Link>}</nav>}
    <RoleAccess accounts={accounts} siteKey={recaptchaSiteKey()} otpConfigured={!!process.env.SUPABASE_PUBLISHABLE_KEY} /></div>;
}
