BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('buyer','seller','conveyancer','admin')),
  full_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','invited')),
  phone TEXT DEFAULT '',
  email_verified_at TIMESTAMPTZ,
  phone_verified_at TIMESTAMPTZ,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  profile_image_data TEXT DEFAULT '',
  profile_image_mime TEXT DEFAULT '',
  profile_image_updated_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conveyancer_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  firm_name TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  state TEXT DEFAULT '',
  suburb TEXT DEFAULT '',
  website TEXT DEFAULT '',
  remote_friendly BOOLEAN DEFAULT FALSE,
  turnaround TEXT DEFAULT '',
  response_time TEXT DEFAULT '',
  specialties TEXT DEFAULT '[]',
  verified BOOLEAN DEFAULT FALSE,
  gov_status TEXT NOT NULL DEFAULT 'pending',
  gov_check_reference TEXT DEFAULT '',
  gov_verified_at TIMESTAMPTZ,
  gov_denial_reason TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS customer_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('buyer','seller')),
  preferred_contact_method TEXT NOT NULL DEFAULT 'email',
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conveyancer_reviews (
  id SERIAL PRIMARY KEY,
  conveyancer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewer_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL,
  job_reference TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_reviews (
  id SERIAL PRIMARY KEY,
  reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewer_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_jobs (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conveyancer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending','in_progress','completed','canceled')),
  reference TEXT DEFAULT '',
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id SERIAL PRIMARY KEY,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata TEXT DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION prevent_admin_audit_log_modifications() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log_immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_audit_log_prevent_update ON admin_audit_log;
CREATE TRIGGER admin_audit_log_prevent_update
BEFORE UPDATE ON admin_audit_log
FOR EACH ROW EXECUTE FUNCTION prevent_admin_audit_log_modifications();

DROP TRIGGER IF EXISTS admin_audit_log_prevent_delete ON admin_audit_log;
CREATE TRIGGER admin_audit_log_prevent_delete
BEFORE DELETE ON admin_audit_log
FOR EACH ROW EXECUTE FUNCTION prevent_admin_audit_log_modifications();

CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  participant_a INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant_b INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_participants UNIQUE (participant_a, participant_b)
);

CREATE TABLE IF NOT EXISTS conversation_perspectives (
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  perspective TEXT NOT NULL CHECK (perspective IN ('buyer','seller')),
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS message_files (
  id SERIAL PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  ciphertext BYTEA NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS message_policy_flags (
  id SERIAL PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  flag_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS call_sessions (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  join_url TEXT NOT NULL,
  access_token TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_call_sessions_conversation ON call_sessions (conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  id TEXT PRIMARY KEY,
  persona TEXT NOT NULL DEFAULT 'assistant',
  origin TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  summary TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  escalated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_chat_escalations (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_signatures (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_reference TEXT DEFAULT '',
  certificate_hash TEXT DEFAULT '',
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_signature_signers (
  id TEXT PRIMARY KEY,
  signature_id TEXT NOT NULL REFERENCES document_signatures(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  signing_url TEXT DEFAULT '',
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_signature_audit (
  id TEXT PRIMARY KEY,
  signature_id TEXT NOT NULL REFERENCES document_signatures(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  metadata TEXT DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  previous_hash TEXT DEFAULT '',
  entry_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS milestone_quotes (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  milestone_id TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  issued_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ,
  last_notified_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS quote_notifications (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES milestone_quotes(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  delivered BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trust_accounts (
  id SERIAL PRIMARY KEY,
  conveyancer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  bsb TEXT NOT NULL,
  compliance_status TEXT NOT NULL DEFAULT 'pending',
  last_reconciled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_trust_accounts UNIQUE (account_number, bsb)
);

CREATE TABLE IF NOT EXISTS trust_payout_reports (
  id TEXT PRIMARY KEY,
  trust_account_id INTEGER NOT NULL REFERENCES trust_accounts(id) ON DELETE CASCADE,
  payment_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL,
  reviewer TEXT NOT NULL,
  notes TEXT DEFAULT '',
  certificate_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  revoked BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS chat_invoices (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'AUD',
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','accepted','released','cancelled')),
  service_fee_cents INTEGER DEFAULT 0,
  escrow_cents INTEGER DEFAULT 0,
  refunded_cents INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS chat_invoice_events (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES chat_invoices(id) ON DELETE CASCADE,
  actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload TEXT DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_verification_codes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email','phone')),
  code_hash TEXT NOT NULL,
  code_salt TEXT NOT NULL,
  metadata TEXT DEFAULT '{}',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_catalogue (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  audience TEXT DEFAULT '',
  preview_markdown TEXT DEFAULT '',
  features TEXT DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conveyancer_job_history (
  id SERIAL PRIMARY KEY,
  conveyancer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  matter_type TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  location TEXT NOT NULL,
  summary TEXT NOT NULL,
  clients TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS conveyancer_document_badges (
  id SERIAL PRIMARY KEY,
  conveyancer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('valid','expiring','expired')),
  reference TEXT NOT NULL,
  last_verified TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS content_pages (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  meta_description TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS homepage_sections (
  key TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_document_signatures_job ON document_signatures(job_id);
CREATE INDEX IF NOT EXISTS idx_document_signatures_document ON document_signatures(document_id);
CREATE INDEX IF NOT EXISTS idx_milestone_quotes_job ON milestone_quotes(job_id);
CREATE INDEX IF NOT EXISTS idx_trust_accounts_conveyancer ON trust_accounts(conveyancer_id);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_user ON auth_refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_created ON product_reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_jobs_lookup ON customer_jobs(customer_id, conveyancer_id, status);
CREATE INDEX IF NOT EXISTS idx_user_verification_lookup ON user_verification_codes(user_id, channel, created_at DESC);

COMMIT;
