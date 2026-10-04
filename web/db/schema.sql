CREATE TABLE IF NOT EXISTS events (
  id text PRIMARY KEY,
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT','ENTRY_OPEN','ENTRY_CLOSED','SELLING','SOLD_OUT','CLOSED')),
  entry_opens_at timestamptz NOT NULL,
  entry_closes_at timestamptz NOT NULL,
  total_inventory integer NOT NULL CHECK (total_inventory >= 0),
  available integer NOT NULL CHECK (available >= 0),
  reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  sold integer NOT NULL DEFAULT 0 CHECK (sold >= 0),
  batch_size integer NOT NULL DEFAULT 20 CHECK (batch_size > 0),
  reservation_ttl_seconds integer NOT NULL DEFAULT 300 CHECK (reservation_ttl_seconds > 0),
  queue_policy_version text NOT NULL DEFAULT 'window-random-v1',
  access_mode text NOT NULL DEFAULT 'DEMO' CHECK (access_mode IN ('DEMO','PROTECTED')),
  is_listed boolean NOT NULL DEFAULT false,
  event_starts_at timestamptz,
  venue text,
  image_url text,
  simulation_run_id text,
  admission_ttl_seconds integer NOT NULL DEFAULT 120 CHECK (admission_ttl_seconds > 0),
  ordering_cutoff_at timestamptz,
  ordered_at timestamptz,
  ordered_count integer CHECK (ordered_count IS NULL OR ordered_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_balanced CHECK (available + reserved + sold = total_inventory),
  CONSTRAINT entry_window_valid CHECK (entry_closes_at > entry_opens_at)
);
ALTER TABLE events ADD COLUMN IF NOT EXISTS admission_ttl_seconds integer NOT NULL DEFAULT 120;
ALTER TABLE events ADD COLUMN IF NOT EXISTS ordering_cutoff_at timestamptz;
ALTER TABLE events ADD COLUMN IF NOT EXISTS ordered_at timestamptz;
ALTER TABLE events ADD COLUMN IF NOT EXISTS ordered_count integer;
ALTER TABLE events ADD COLUMN IF NOT EXISTS access_mode text NOT NULL DEFAULT 'DEMO';
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_listed boolean NOT NULL DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_starts_at timestamptz;
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS simulation_run_id text;

CREATE TABLE IF NOT EXISTS demo_current_event (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  event_id text NOT NULL REFERENCES events(id)
);

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL CHECK (hits >= 0)
);

CREATE TABLE IF NOT EXISTS demo_accounts (
  id text PRIMARY KEY,
  display_name text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'buyer' CHECK (role IN ('buyer','organizer')),
  auth_kind text NOT NULL DEFAULT 'DEMO' CHECK (auth_kind IN ('DEMO','PASSWORD','SIMULATION','EMAIL_OTP')),
  simulation_index integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE demo_accounts ADD COLUMN IF NOT EXISTS auth_kind text NOT NULL DEFAULT 'DEMO';
ALTER TABLE demo_accounts ADD COLUMN IF NOT EXISTS simulation_index integer;
ALTER TABLE demo_accounts DROP CONSTRAINT IF EXISTS demo_accounts_auth_kind_check;
ALTER TABLE demo_accounts ADD CONSTRAINT demo_accounts_auth_kind_check CHECK (auth_kind IN ('DEMO','PASSWORD','SIMULATION','EMAIL_OTP'));

CREATE TABLE IF NOT EXISTS protected_people (
  id text PRIMARY KEY,
  event_id text NOT NULL REFERENCES events(id),
  reference_hash text NOT NULL,
  label text NOT NULL,
  review_state text NOT NULL DEFAULT 'APPROVED' CHECK (review_state IN ('APPROVED','REVIEW_REQUIRED','BLOCKED')),
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, reference_hash),
  UNIQUE (event_id, id)
);

CREATE TABLE IF NOT EXISTS protected_invitations (
  id text PRIMARY KEY,
  event_id text NOT NULL REFERENCES events(id),
  person_id text NOT NULL REFERENCES protected_people(id),
  code_hash text NOT NULL UNIQUE,
  claimed_account_id text REFERENCES demo_accounts(id),
  issued_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  CHECK ((claimed_at IS NULL) = (claimed_account_id IS NULL))
);

CREATE TABLE IF NOT EXISTS protected_credentials (
  account_id text PRIMARY KEY REFERENCES demo_accounts(id),
  event_id text NOT NULL REFERENCES events(id),
  person_id text NOT NULL REFERENCES protected_people(id),
  username text NOT NULL,
  password_hash text NOT NULL,
  signup_ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, username),
  UNIQUE (event_id, person_id)
);

CREATE TABLE IF NOT EXISTS queue_entries (
  id text PRIMARY KEY,
  event_id text NOT NULL REFERENCES events(id),
  account_id text NOT NULL REFERENCES demo_accounts(id),
  person_id text REFERENCES protected_people(id),
  identity_key text,
  received_at timestamptz NOT NULL DEFAULT now(),
  position integer,
  state text NOT NULL DEFAULT 'QUEUED' CHECK (state IN ('QUEUED','ADMITTED','RESERVED','CONFIRMED','EXPIRED','SOLD_OUT')),
  admitted_at timestamptz,
  admission_expires_at timestamptz,
  UNIQUE (event_id, account_id),
  CHECK (position IS NULL OR position > 0)
);
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS person_id text REFERENCES protected_people(id);
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS identity_key text;
CREATE UNIQUE INDEX IF NOT EXISTS one_queue_entry_per_person ON queue_entries(event_id,person_id) WHERE person_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS queue_position_unique ON queue_entries(event_id, position) WHERE position IS NOT NULL;
CREATE INDEX IF NOT EXISTS queue_waiting_position ON queue_entries(event_id, position) WHERE state='QUEUED' AND position IS NOT NULL;

CREATE TABLE IF NOT EXISTS reservations (
  id text PRIMARY KEY,
  event_id text NOT NULL REFERENCES events(id),
  account_id text NOT NULL REFERENCES demo_accounts(id),
  person_id text REFERENCES protected_people(id),
  seat_no integer CHECK (seat_no IS NULL OR seat_no > 0),
  queue_entry_id text NOT NULL REFERENCES queue_entries(id),
  state text NOT NULL CHECK (state IN ('ACTIVE','CONFIRMED','EXPIRED')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS person_id text REFERENCES protected_people(id);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS seat_no integer;
CREATE UNIQUE INDEX IF NOT EXISTS one_live_reservation_per_person ON reservations(event_id,person_id) WHERE person_id IS NOT NULL AND state IN ('ACTIVE','CONFIRMED');
CREATE UNIQUE INDEX IF NOT EXISTS one_live_reservation ON reservations(event_id, account_id) WHERE state IN ('ACTIVE','CONFIRMED');
CREATE INDEX IF NOT EXISTS active_reservation_lookup ON reservations(event_id,account_id,created_at DESC) WHERE state='ACTIVE';
-- Expired holds release their seat number; active and confirmed holds cannot share it.
CREATE UNIQUE INDEX IF NOT EXISTS one_live_holder_per_seat ON reservations(event_id,seat_no)
  WHERE seat_no IS NOT NULL AND state IN ('ACTIVE','CONFIRMED');

CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY,
  event_id text NOT NULL REFERENCES events(id),
  account_id text NOT NULL REFERENCES demo_accounts(id),
  person_id text REFERENCES protected_people(id),
  reservation_id text NOT NULL UNIQUE REFERENCES reservations(id),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, account_id)
);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS person_id text REFERENCES protected_people(id);
CREATE UNIQUE INDEX IF NOT EXISTS one_order_per_person ON orders(event_id,person_id) WHERE person_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS idempotency_records (
  event_id text NOT NULL REFERENCES events(id),
  account_id text NOT NULL REFERENCES demo_accounts(id),
  operation text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  response_status integer NOT NULL,
  response_body jsonb NOT NULL,
  PRIMARY KEY (event_id, account_id, operation, key)
);

CREATE TABLE IF NOT EXISTS simulation_runs (
  id text PRIMARY KEY,
  source_event_id text REFERENCES events(id),
  event_id text REFERENCES events(id),
  seed text NOT NULL,
  config jsonb NOT NULL,
  status text NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('READY','RUNNING','COMPLETED','FAILED')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  results jsonb
);
ALTER TABLE simulation_runs ADD COLUMN IF NOT EXISTS source_event_id text REFERENCES events(id);
ALTER TABLE simulation_runs ADD COLUMN IF NOT EXISTS event_id text REFERENCES events(id);
ALTER TABLE simulation_runs ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'RUNNING';
ALTER TABLE simulation_runs DROP CONSTRAINT IF EXISTS simulation_runs_status_check;
ALTER TABLE simulation_runs ADD CONSTRAINT simulation_runs_status_check CHECK (status IN ('READY','RUNNING','COMPLETED','FAILED'));

-- These tables apply only to isolated hackathon runs. The ordinary sale keeps its
-- existing rules even when a judge disables a defense for a comparison run.
CREATE TABLE IF NOT EXISTS demo_run_policies (
  event_id text PRIMARY KEY REFERENCES events(id),
  run_id text NOT NULL REFERENCES simulation_runs(id),
  rate_limit_enabled boolean NOT NULL DEFAULT true,
  identity_limit_enabled boolean NOT NULL DEFAULT true,
  challenge_enabled boolean NOT NULL DEFAULT true,
  allocation_mode text NOT NULL DEFAULT 'RANDOM' CHECK (allocation_mode IN ('RANDOM','FIRST_COME'))
);

CREATE TABLE IF NOT EXISTS demo_actors (
  event_id text NOT NULL REFERENCES events(id),
  account_id text NOT NULL REFERENCES demo_accounts(id),
  identity_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('HUMAN','BOT')),
  PRIMARY KEY (event_id,account_id)
);
CREATE INDEX IF NOT EXISTS demo_actor_identity ON demo_actors(event_id,identity_key);
CREATE INDEX IF NOT EXISTS queue_demo_identity ON queue_entries(event_id,identity_key) WHERE identity_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS demo_challenges (
  id text PRIMARY KEY,
  event_id text NOT NULL REFERENCES events(id),
  account_id text NOT NULL REFERENCES demo_accounts(id),
  nonce text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE TABLE IF NOT EXISTS audit_events (
  id text PRIMARY KEY,
  event_id text NOT NULL REFERENCES events(id),
  account_id text REFERENCES demo_accounts(id),
  type text NOT NULL,
  reason_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  simulation_run_id text REFERENCES simulation_runs(id)
);
CREATE INDEX IF NOT EXISTS buyer_reason_history ON audit_events(event_id,account_id,occurred_at DESC,id DESC) WHERE reason_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_event_live_feed ON audit_events(event_id,occurred_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS audit_event_blocked_count ON audit_events(event_id) WHERE type IN ('REQUEST_THROTTLED','REQUEST_REJECTED');
