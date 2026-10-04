import { createClient } from "@supabase/supabase-js";

const PROJECT_URL = "https://tvgnepeuljwqwmiegedd.supabase.co";

export function supabaseAuth() {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!key) return null;
  // Authentication runs on the server. The key is public, but the database
  // password never reaches the browser.
  return createClient(PROJECT_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
