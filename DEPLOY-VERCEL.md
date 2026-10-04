# Deploy Fair Drop with Codex and Vercel

The deployable Next.js app is in `web/`. Open this extracted project folder in Codex and ask it to deploy the `web` app to Vercel. Set **Root Directory** to `web` in Vercel. Use the project's `package-lock.json`; the normal install and build commands are `npm ci` and `npm run build`.

## Configure Vercel

Add these variables in Vercel Project Settings → Environment Variables before deploying. Use `web/.env.example` as the complete reference. **Never commit or upload `web/.env.local`.**

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Supabase PostgreSQL connection URI, with `sslmode=require` (or `verify-full`). This is required on Vercel. |
| `SESSION_SECRET` | A new long random secret for signed sessions. |
| `ADMIN_SECRET` | A strong organiser login secret. |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key for attendee email OTP. |
| `NEXT_PUBLIC_SITE_URL` | The deployed `https://...vercel.app` domain or custom domain. |
| `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY` | Real Google reCAPTCHA v2 checkbox keys for the deployed domain. |
| `RECAPTCHA_EXPECTED_HOSTNAME` | The deployed domain without `https://`. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Real Cloudflare Turnstile keys if the protected queue challenge is enabled. |
| `TURNSTILE_EXPECTED_HOSTNAME` | The deployed domain without `https://`. |

Create the same environment variables for Production and Preview if both environments should work. Register every deployed domain used for authentication in Supabase Auth's URL configuration, and register the domain with the CAPTCHA providers. The current Supabase Auth project URL is set in `web/src/lib/supabase-auth.ts`; update it if deploying against a different Supabase project.

The app applies `web/db/schema.sql` automatically when it first connects. `web/db/supabase-private.sql` removes public Data API access to app tables. Existing events and demo results are **in the Supabase database**, not this ZIP. Use a connection to the same Supabase project to see them after deployment; a fresh database starts with the seed event.

## Check after deployment

Open `/auth`, sign in as an organiser, open `/admin/events`, and check that events appear. Then open the attendee event list. Keep the database URL and organiser secret server-side; do not give them `NEXT_PUBLIC_` names.

## Bot simulator hosting limit

The bot attack worker currently uses a background task in the local Node process and its launch route accepts only localhost by default. **The live bot simulator is not deployable as-is on Vercel functions.** The rest of the app can be deployed, including saved results and fairness views. Run the live attack demo locally, or move the simulator to a durable external worker before promising live attacks on Vercel. Do not set `LAB_BASE_URL` to the public deployment as a workaround: Vercel can stop a function after it sends the response.
