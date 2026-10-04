-- Fair Drop uses its own Next.js routes and server-side PostgreSQL connection.
-- These tables are not intended to be queried with Supabase's public Data API.
-- Keep the app's database connection string on the server only.
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_current_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE protected_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE protected_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE protected_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_run_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_actors ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE events, demo_current_event, rate_limit_buckets, demo_accounts,
  protected_people, protected_invitations, protected_credentials, queue_entries,
  reservations, orders, idempotency_records, simulation_runs, demo_run_policies,
  demo_actors, demo_challenges, audit_events FROM anon, authenticated;
