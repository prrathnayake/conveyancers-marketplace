import fs from 'fs'
import path from 'path'
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg'

const connectionString =
  process.env.DB_URL || 'postgres://app:change-me@localhost:5432/convey'

const pool = new Pool({ connectionString, connectionTimeoutMillis: 1000 })

let dbUnavailable = false

const markDatabaseUnavailable = (error: unknown): void => {
  if (!dbUnavailable) {
    dbUnavailable = true
    console.warn('Database unavailable; falling back to stub data only.', error)
  }
}

const runBlocking = <T>(promise: Promise<T>): T => {
  const buffer = new SharedArrayBuffer(4)
  const view = new Int32Array(buffer)
  let result: T | undefined
  let error: unknown

  promise
    .then((value) => {
      result = value
      Atomics.store(view, 0, 1)
      Atomics.notify(view, 0, 1)
    })
    .catch((err) => {
      error = err
      Atomics.store(view, 0, 1)
      Atomics.notify(view, 0, 1)
    })

  while (Atomics.load(view, 0) === 0) {
    Atomics.wait(view, 0, 0, 1000)
  }

  if (error) {
    throw error
  }

  return result as T
}

const MIGRATIONS_TABLE = 'schema_migrations'
const MIGRATIONS_DIR = path.join(__dirname, 'migrations')

const readMigrations = (): Array<{ id: string; sql: string }> => {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return []
  }

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => {
      const id = file.replace(/\.sql$/, '')
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
      return { id, sql }
    })
}

const ensureWalJournalMode = (): void => {
  // PostgreSQL enables WAL semantics by default; retained for compatibility with
  // earlier SQLite-based implementations where the call ensured durability.
}

const ensureColumn = (_table: string, _column: string, _definition: string): void => {
  // Column backfills are managed via migrations in the Postgres implementation.
}

let schemaInitialized = false

const runMigrations = async (): Promise<void> => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    )
    await client.query('COMMIT')

    const migrations = readMigrations()

    for (const migration of migrations) {
      const { rows } = await client.query<{ exists: boolean }>(
        `SELECT TRUE AS exists FROM ${MIGRATIONS_TABLE} WHERE id = $1`,
        [migration.id]
      )
      if (rows.length > 0) {
        continue
      }

      await client.query('BEGIN')
      try {
        await client.query(migration.sql)
        await client.query(`INSERT INTO ${MIGRATIONS_TABLE} (id) VALUES ($1)`, [migration.id])
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  } finally {
    client.release()
  }
}

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') {
    return value
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  return 0
}

const insertCustomerProfiles = async (client: PoolClient): Promise<void> => {
  const { rows } = await client.query<{ id: number; role: 'buyer' | 'seller' }>(
    `SELECT id, role FROM users WHERE role IN ('buyer','seller')`
  )
ensureWalJournalMode()

const applySchema = (): void => {
  return
  /*
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('buyer','seller','conveyancer','admin')),
      full_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','invited')),
      phone TEXT DEFAULT '',
      email_verified_at DATETIME,
      phone_verified_at DATETIME,
      is_verified INTEGER NOT NULL DEFAULT 0,
      profile_image_data TEXT DEFAULT '',
      profile_image_mime TEXT DEFAULT '',
      profile_image_updated_at DATETIME,
      last_login_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS conveyancer_profiles (
      user_id INTEGER PRIMARY KEY,
      firm_name TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      state TEXT DEFAULT '',
      suburb TEXT DEFAULT '',
      website TEXT DEFAULT '',
      remote_friendly INTEGER DEFAULT 0,
      turnaround TEXT DEFAULT '',
      response_time TEXT DEFAULT '',
      specialties TEXT DEFAULT '[]',
      verified INTEGER DEFAULT 0,
      gov_status TEXT NOT NULL DEFAULT 'pending',
      gov_check_reference TEXT DEFAULT '',
      gov_verified_at DATETIME,
      gov_denial_reason TEXT DEFAULT '',
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS customer_profiles (
      user_id INTEGER PRIMARY KEY,
      role TEXT NOT NULL CHECK (role IN ('buyer','seller')),
      preferred_contact_method TEXT NOT NULL DEFAULT 'email',
      notes TEXT DEFAULT '',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conveyancer_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conveyancer_id INTEGER NOT NULL,
      reviewer_name TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT NOT NULL,
      job_reference TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(conveyancer_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS product_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reviewer_id INTEGER,
      reviewer_name TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(reviewer_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS customer_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      conveyancer_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending','in_progress','completed','canceled')),
      reference TEXT DEFAULT '',
      completed_at DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(customer_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(conveyancer_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TRIGGER IF NOT EXISTS admin_audit_log_prevent_update
    BEFORE UPDATE ON admin_audit_log
    BEGIN
      SELECT RAISE(ABORT, 'admin_audit_log_immutable');
    END;

    CREATE TRIGGER IF NOT EXISTS admin_audit_log_prevent_delete
    BEFORE DELETE ON admin_audit_log
    BEGIN
      SELECT RAISE(ABORT, 'admin_audit_log_immutable');
    END;

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      participant_a INTEGER NOT NULL,
      participant_b INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(participant_a, participant_b),
      FOREIGN KEY(participant_a) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(participant_b) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conversation_perspectives (
      conversation_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      perspective TEXT NOT NULL CHECK (perspective IN ('buyer','seller')),
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (conversation_id, user_id),
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS message_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      ciphertext BLOB NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS message_policy_flags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      flag_type TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS call_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      join_url TEXT NOT NULL,
      access_token TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_call_sessions_conversation
      ON call_sessions (conversation_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS ai_chat_sessions (
      id TEXT PRIMARY KEY,
      persona TEXT NOT NULL DEFAULT 'assistant',
      origin TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      summary TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      escalated_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS ai_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(session_id) REFERENCES ai_chat_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_chat_escalations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(session_id) REFERENCES ai_chat_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS document_signatures (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      provider_reference TEXT DEFAULT '',
      certificate_hash TEXT DEFAULT '',
      signed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS document_signature_signers (
      id TEXT PRIMARY KEY,
      signature_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      signing_url TEXT DEFAULT '',
      completed INTEGER DEFAULT 0,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(signature_id) REFERENCES document_signatures(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS document_signature_audit (
      id TEXT PRIMARY KEY,
      signature_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      previous_hash TEXT DEFAULT '',
      entry_hash TEXT NOT NULL,
      FOREIGN KEY(signature_id) REFERENCES document_signatures(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS milestone_quotes (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      milestone_id TEXT NOT NULL,
      description TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      last_notified_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS quote_notifications (
      id TEXT PRIMARY KEY,
      quote_id TEXT NOT NULL,
      message TEXT NOT NULL,
      delivered INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(quote_id) REFERENCES milestone_quotes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS trust_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conveyancer_id INTEGER NOT NULL,
      account_name TEXT NOT NULL,
      account_number TEXT NOT NULL,
      bsb TEXT NOT NULL,
      compliance_status TEXT NOT NULL DEFAULT 'pending',
      last_reconciled_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(account_number, bsb),
      FOREIGN KEY(conveyancer_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS trust_payout_reports (
      id TEXT PRIMARY KEY,
      trust_account_id INTEGER NOT NULL,
      payment_id TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      processed_at DATETIME NOT NULL,
      reviewer TEXT NOT NULL,
      notes TEXT DEFAULT '',
      certificate_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(trust_account_id) REFERENCES trust_accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      revoked INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_document_signatures_job ON document_signatures(job_id);
    CREATE INDEX IF NOT EXISTS idx_document_signatures_document ON document_signatures(document_id);
    CREATE INDEX IF NOT EXISTS idx_milestone_quotes_job ON milestone_quotes(job_id);
    CREATE INDEX IF NOT EXISTS idx_trust_accounts_conveyancer ON trust_accounts(conveyancer_id);
    CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_user ON auth_refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_product_reviews_created ON product_reviews(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_customer_jobs_lookup ON customer_jobs(customer_id, conveyancer_id, status);

    CREATE TABLE IF NOT EXISTS chat_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      creator_id INTEGER NOT NULL,
      recipient_id INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'AUD',
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','accepted','released','cancelled')),
      service_fee_cents INTEGER DEFAULT 0,
      escrow_cents INTEGER DEFAULT 0,
      refunded_cents INTEGER DEFAULT 0,
      psp_reference TEXT DEFAULT '',
      psp_status TEXT DEFAULT '',
      psp_failure_reason TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      accepted_at DATETIME,
      released_at DATETIME,
      cancelled_at DATETIME,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY(creator_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(recipient_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_invoice_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      actor_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(invoice_id) REFERENCES chat_invoices(id) ON DELETE CASCADE,
      FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_verification_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      channel TEXT NOT NULL CHECK (channel IN ('email','phone')),
      code_hash TEXT NOT NULL,
      code_salt TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_verification_lookup ON user_verification_codes(user_id, channel, created_at DESC);

    CREATE TABLE IF NOT EXISTS service_catalogue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      audience TEXT DEFAULT '',
      preview_markdown TEXT DEFAULT '',
      features TEXT DEFAULT '[]',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS conveyancer_job_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conveyancer_id INTEGER NOT NULL,
      matter_type TEXT NOT NULL,
      completed_at DATETIME NOT NULL,
      location TEXT NOT NULL,
      summary TEXT NOT NULL,
      clients TEXT DEFAULT '',
      FOREIGN KEY(conveyancer_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conveyancer_document_badges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conveyancer_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('valid','expiring','expired')),
      reference TEXT NOT NULL,
      last_verified DATETIME NOT NULL,
      expires_at DATETIME,
      FOREIGN KEY(conveyancer_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS content_pages (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      meta_description TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS homepage_sections (
      key TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)
  */
}

  for (const row of rows) {
    await client.query(
      `INSERT INTO customer_profiles (user_id, role)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [row.id, row.role]
    )
  }
}

const insertConveyancerArtifacts = async (client: PoolClient): Promise<void> => {
  const { rows: conveyancerRows } = await client.query<{ user_id: number }>(
    'SELECT user_id FROM conveyancer_profiles'
  )
  if (conveyancerRows.length === 0) {
    return
  }

  const { rows: customers } = await client.query<{ id: number }>(
    `SELECT id FROM users WHERE role IN ('buyer','seller')`
  )
  ensureColumn('users', 'last_login_at', 'last_login_at DATETIME')
  ensureColumn('users', 'phone', "phone TEXT DEFAULT ''")
  ensureColumn('users', 'email_verified_at', 'email_verified_at DATETIME')
  ensureColumn('users', 'phone_verified_at', 'phone_verified_at DATETIME')
  ensureColumn('users', 'is_verified', 'is_verified INTEGER NOT NULL DEFAULT 0')
  ensureColumn('users', 'profile_image_data', "profile_image_data TEXT DEFAULT ''")
  ensureColumn('users', 'profile_image_mime', "profile_image_mime TEXT DEFAULT ''")
  ensureColumn('users', 'profile_image_updated_at', 'profile_image_updated_at DATETIME')
  ensureColumn('service_catalogue', 'audience', "audience TEXT DEFAULT ''")
  ensureColumn('service_catalogue', 'preview_markdown', "preview_markdown TEXT DEFAULT ''")
  ensureColumn('service_catalogue', 'features', "features TEXT DEFAULT '[]'")
  ensureColumn('chat_invoices', 'refunded_cents', 'refunded_cents INTEGER DEFAULT 0')
  ensureColumn('chat_invoices', 'psp_reference', "psp_reference TEXT DEFAULT ''")
  ensureColumn('chat_invoices', 'psp_status', "psp_status TEXT DEFAULT ''")
  ensureColumn('chat_invoices', 'psp_failure_reason', "psp_failure_reason TEXT DEFAULT ''")
  ensureColumn('document_signature_signers', 'created_at', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP')
  ensureColumn('document_signature_signers', 'signing_url', "signing_url TEXT DEFAULT ''")
  ensureColumn('conveyancer_reviews', 'job_reference', "job_reference TEXT DEFAULT ''")
  schemaInitialized = true

  const now = new Date()
  const iso = (offsetDays: number): string => {
    const copy = new Date(now.getTime())
    copy.setDate(copy.getDate() - offsetDays)
    return copy.toISOString()
  }

  const expires = (offsetDays: number): string => {
    const copy = new Date(now.getTime())
    copy.setDate(copy.getDate() + offsetDays)
    return copy.toISOString()
  }

  let customerCursor = 0

  for (const { user_id: conveyancerId } of conveyancerRows) {
    const historyCount = await client.query<{ total: number }>(
      'SELECT COUNT(1) AS total FROM conveyancer_job_history WHERE conveyancer_id = $1',
      [conveyancerId]
    )
    if (!toNumber(historyCount.rows[0]?.total)) {
      await client.query(
        `INSERT INTO conveyancer_job_history (conveyancer_id, matter_type, completed_at, location, summary, clients)
         VALUES ($1, $2, $3, $4, $5, $6)`
      , [
        conveyancerId,
        'Residential purchase',
        iso(30),
        'Melbourne, VIC',
        'Coordinated contract exchange, finance approvals, and settlement scheduling.',
        'Buyer and lender',
      ])
      await client.query(
        `INSERT INTO conveyancer_job_history (conveyancer_id, matter_type, completed_at, location, summary, clients)
         VALUES ($1, $2, $3, $4, $5, $6)`
      , [
        conveyancerId,
        'Off-the-plan apartment',
        iso(65),
        'Sydney, NSW',
        'Managed vendor variations, staged deposits, and bank readiness for settlement.',
        'Vendor and buyer',
      ])
      await client.query(
        `INSERT INTO conveyancer_job_history (conveyancer_id, matter_type, completed_at, location, summary, clients)
         VALUES ($1, $2, $3, $4, $5, $6)`
      , [
        conveyancerId,
        'Commercial retail lease',
        iso(120),
        'Brisbane, QLD',
        'Negotiated fit-out clauses, insurance evidence, and milestone-based rent release.',
        'Lessor and lessee',
      ])
      await client.query(
        `INSERT INTO conveyancer_job_history (conveyancer_id, matter_type, completed_at, location, summary, clients)
         VALUES ($1, $2, $3, $4, $5, $6)`
      , [
        conveyancerId,
        'Strata title townhouse',
        iso(200),
        'Perth, WA',
        'Resolved outstanding encumbrances and coordinated digital signing ceremonies.',
        'Buyer, seller, and strata manager',
      ])
    }

    const badgeCount = await client.query<{ total: number }>(
      'SELECT COUNT(1) AS total FROM conveyancer_document_badges WHERE conveyancer_id = $1',
      [conveyancerId]
    )
    if (!toNumber(badgeCount.rows[0]?.total)) {
      await client.query(
        `INSERT INTO conveyancer_document_badges (conveyancer_id, label, status, reference, last_verified, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          conveyancerId,
          'Professional indemnity insurance',
          'valid',
          `PI-${conveyancerId}`,
          iso(14),
          expires(180),
        ]
      )
      await client.query(
        `INSERT INTO conveyancer_document_badges (conveyancer_id, label, status, reference, last_verified, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          conveyancerId,
          'National police check',
          'valid',
          `NPC-${conveyancerId}`,
          iso(30),
          expires(365),
        ]
      )
    }

    const reviewCount = await client.query<{ total: number }>(
      'SELECT COUNT(1) AS total FROM conveyancer_reviews WHERE conveyancer_id = $1',
      [conveyancerId]
    )
    if (!toNumber(reviewCount.rows[0]?.total)) {
      const jobRefOne = `JOB-${conveyancerId}-01`
      const jobRefTwo = `JOB-${conveyancerId}-02`
      await client.query(
        `INSERT INTO conveyancer_reviews (conveyancer_id, reviewer_name, rating, comment, job_reference)
         VALUES ($1, $2, $3, $4, $5)`
      , [
        conveyancerId,
        'Verified buyer',
        5,
        'Transparent milestones and proactive updates made the purchase straightforward.',
        jobRefOne,
      ])
      await client.query(
        `INSERT INTO conveyancer_reviews (conveyancer_id, reviewer_name, rating, comment, job_reference)
         VALUES ($1, $2, $3, $4, $5)`
      , [
        conveyancerId,
        'Settlement partner',
        4,
        'Responsive communication and strong compliance hygiene across every step.',
        jobRefTwo,
      ])

      if (customers.length > 0) {
        const firstCustomer = customers[customerCursor % customers.length]
        const secondCustomer = customers[(customerCursor + 1) % customers.length]
        customerCursor = (customerCursor + 2) % customers.length

        const firstExists = await client.query<{ total: number }>(
          'SELECT COUNT(1) AS total FROM customer_jobs WHERE customer_id = $1 AND conveyancer_id = $2',
          [firstCustomer.id, conveyancerId]
        )
        if (!toNumber(firstExists.rows[0]?.total)) {
          await client.query(
            `INSERT INTO customer_jobs (customer_id, conveyancer_id, status, reference, completed_at)
             VALUES ($1, $2, 'completed', $3, $4)`
          , [firstCustomer.id, conveyancerId, jobRefOne, iso(12)])
        }

        const secondExists = await client.query<{ total: number }>(
          'SELECT COUNT(1) AS total FROM customer_jobs WHERE customer_id = $1 AND conveyancer_id = $2',
          [secondCustomer.id, conveyancerId]
        )
        if (!toNumber(secondExists.rows[0]?.total)) {
          await client.query(
            `INSERT INTO customer_jobs (customer_id, conveyancer_id, status, reference, completed_at)
             VALUES ($1, $2, 'completed', $3, $4)`
          , [secondCustomer.id, conveyancerId, jobRefTwo, iso(18)])
        }
      }
    }
  }
}

const insertProductReviews = async (client: PoolClient): Promise<void> => {
  const { rows } = await client.query<{ total: number }>('SELECT COUNT(1) AS total FROM product_reviews')
  if (toNumber(rows[0]?.total)) {
    return
  }

  const now = new Date()
  const iso = (offsetDays: number): string => {
    const copy = new Date(now.getTime())
    copy.setDate(copy.getDate() - offsetDays)
    return copy.toISOString()
  }

  const inserts: Array<[string, number, string, string]> = [
    [
      'Harper • Buyer',
      5,
      'The Conveyancers Marketplace platform kept every milestone visible and approvals were effortless.',
      iso(4),
    ],
    [
      'Mason • Seller',
      4,
      'Escrow tracking and document badges gave us confidence while we negotiated tight deadlines.',
      iso(9),
    ],
    [
      'Avery • Conveyancer',
      5,
      'Secure messaging, quote management, and audit logs made collaboration with clients seamless.',
      iso(15),
    ],
    [
      'Jordan • Buyer',
      5,
      'Receiving automated alerts for every settlement step meant no surprises ahead of completion.',
      iso(21),
    ],
    [
      'Quinn • Lender partner',
      5,
      'Document verification and milestone controls reduced settlement risk across our loan book.',
      iso(32),
    ],
  ]

  for (const [reviewerName, rating, comment, createdAt] of inserts) {
    await client.query(
      `INSERT INTO product_reviews (reviewer_name, rating, comment, created_at)
       VALUES ($1, $2, $3, $4)`
    , [reviewerName, rating, comment, createdAt])
  }
}

const upsertContentPages = async (client: PoolClient): Promise<void> => {
  const entries = [
    {
      slug: 'about-us',
      title: 'About Conveyancers Marketplace',
      body:
        '## About us\nConveyancers Marketplace unites licenced professionals, buyers, sellers, and lenders in one settlement workspace.\n\n### Our mission\nDeliver compliant, collaborative settlements that keep every milestone visible.\n\n### How we work\nWe partner with firms across Australia to align regulatory guardrails with client experience.\n\n### Where we operate\nSydney and Melbourne hubs with practitioners servicing every state and territory.\n\n### Join the team\nContact careers@conveyancers.market to explore current opportunities.',
      metaDescription:
        'Discover the Conveyancers Marketplace team and how the ConveySafe assurance network supports compliant settlements.',
    },
    {
      slug: 'contact-us',
      title: 'Talk with the ConveySafe team',
      body:
        '## Contact us\nWe are available 7 days a week to help buyers, sellers, conveyancers, and partners.\n\n- **Email:** support@conveyancers.market\n- **Phone:** 1300 555 019 (8am – 8pm AEST)\n- **Compliance escalation:** compliance@conveysafe.au\n\nLooking for press enquiries? Reach out to press@conveyancers.market.',
      metaDescription:
        'Reach the ConveySafe operations and compliance teams for settlement assistance, partnership opportunities, or media enquiries.',
    },
    {
      slug: 'home',
      title: 'Conveyancers Marketplace',
      body: 'Homepage content is managed within the application.',
      metaDescription:
        'Conveyancers Marketplace connects buyers, sellers, and licenced professionals with ConveySafe compliance, escrow, and collaboration tools.',
    },
  ]

  for (const entry of entries) {
    await client.query(
      `INSERT INTO content_pages (slug, title, body, meta_description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title,
         body = EXCLUDED.body,
         meta_description = EXCLUDED.meta_description,
         updated_at = CURRENT_TIMESTAMP`,
      [entry.slug, entry.title, entry.body, entry.metaDescription]
    )
  }
}

const upsertHomepageSections = async (client: PoolClient): Promise<void> => {
  const hero = {
    badge: 'ConveySafe assurance network',
    title: 'Settle property deals with clarity and control',
    subtitle:
      'Discover licenced conveyancers, orchestrate every milestone, and keep funds protected within the ConveySafe compliance perimeter.',
    primaryCta: { label: 'Browse verified conveyancers', href: '/search' },
    secondaryCta: { label: 'See how the workflow fits together', href: '#workflow' },
  }

  const personas = [
    {
      key: 'buyer',
      label: "I'm buying",
      headline: 'Remove the stress from settlement',
      benefits: [
        'Track every milestone, deposit, and ConveySafe badge from one dashboard.',
        'Know exactly who to call with real-time messaging, policy reminders, and locked-in audit trails.',
        'Escrow protects your funds until each ConveySafe milestone is satisfied.',
      ],
    },
    {
      key: 'seller',
      label: "I'm selling",
      headline: 'Close faster with proactive support',
      benefits: [
        'Automated reminders keep your buyer, lender, and conveyancer aligned inside the compliance guardrails.',
        'Digitally collect, sign, and lodge documents with ConveySafe evidence logging.',
        'Performance insights surface experts who specialise in complex titles with verified insurance.',
      ],
    },
    {
      key: 'conveyancer',
      label: "I'm a conveyancer",
      headline: 'Grow a reputation for trusted settlements',
      benefits: [
        'ConveySafe verification boosts your discoverability and showcases compliant licensing.',
        'Built-in client onboarding, IDV hand-offs, and loyalty pricing reduce admin overhead.',
        'Milestone-based billing flows into escrow with instant audit-grade statements.',
      ],
    },
  ]

  const workflow = [
    {
      step: '01',
      title: 'Match with the right conveyancer',
      copy:
        'Search by state, speciality, property type, or response time. Our ranking blends compliance signals with real client feedback.',
    },
    {
      step: '02',
      title: 'Collaborate and approve milestones',
      copy:
        'Share documents, assign tasks, and approve releases from anywhere. Everything is logged automatically for audit-readiness.',
    },
    {
      step: '03',
      title: 'Settle with confidence',
      copy:
        'Trust the escrow engine, dispute guardrails, and automatic settlement statements when the job is done.',
    },
  ]

  const copy = {
    featuresHeading: 'Everything teams need to settle securely',
    featuresDescription:
      'Coordinate verified experts, compliance artefacts, and settlement workflows from one collaborative workspace.',
    workflowHeading: 'See the entire conveyancing journey end-to-end',
    workflowDescription:
      'Conveyancers Marketplace centralises every task, milestone, and approval so property teams stay coordinated from listing to settlement.',
    workflowCta: { label: 'Start by meeting your next conveyancer', href: '/search' },
    testimonialsHeading: 'Trusted by conveyancing teams nationwide',
    testimonialsDescription:
      'Real reviews from verified settlements highlight operational excellence across the ConveySafe network.',
    resourcesHeading: 'Guides for operational excellence',
    resourcesDescription:
      'Keep your team up to speed on compliance, stakeholder communication, and client reporting.',
    faqHeading: 'Frequently asked questions',
    faqDescription:
      'Everything you need to know about security logging, access controls, and settlement visibility.',
  }

  const resources = [
    {
      title: 'Launch checklist: digitising conveyancing in Australia',
      description: '20-point plan that aligns ARNECC guidelines with client experience wins.',
      href: '/docs/DEPLOY.pdf',
    },
    {
      title: 'Escrow dispute playbook',
      description: 'Templates for communicating milestone adjustments with buyers and sellers.',
      href: '/docs/compliance.pdf',
    },
    {
      title: 'Operational metrics dashboard template',
      description: 'Monitor turnaround times, licence renewals, and CSAT in a single view.',
      href: '/docs/metrics.pdf',
    },
  ]

  const faqs = [
    {
      question: 'How is access to sensitive data controlled?',
      answer:
        'Role-based access control enforces the least-privilege principle across buyer, seller, conveyancer, and admin personas. Every API call requires signed headers and is logged for audit readiness.',
    },
    {
      question: 'Can we trace settlement activity end-to-end?',
      answer:
        'Yes. Each milestone, payment change, and document event is tagged with request identifiers that correlate with backend audit logs so issues can be replayed safely.',
    },
    {
      question: 'What happens if a downstream service fails?',
      answer:
        'Automatic exception handling returns structured errors to the client while preserving observability context. Operators receive actionable signals without exposing stack traces.',
    },
  ]

  const cta = {
    title: 'Ready to modernise your conveyancing workflow?',
    copy:
      'Launch a branded client experience with escrow controls, ID verification, and automated reporting in under two weeks.',
    primaryCta: { label: 'Explore conveyancers', href: '/search' },
    secondaryCta: { label: 'Book a product tour', href: 'mailto:hello@conveymarket.au' },
  }

  const entries: Record<string, unknown> = {
    hero,
    personas,
    workflow,
    resources,
    faqs,
    copy,
    cta,
  }

  for (const [key, content] of Object.entries(entries)) {
    await client.query(
      `INSERT INTO homepage_sections (key, content, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET
         content = EXCLUDED.content,
         updated_at = CURRENT_TIMESTAMP`,
      [key, JSON.stringify(content)]
    )
  }
}

let transactionClient: PoolClient | null = null

const runInTransaction = async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

const seedArtifacts = async (): Promise<void> => {
  await runInTransaction(async (client) => {
    await insertCustomerProfiles(client)
    await insertConveyancerArtifacts(client)
    await insertProductReviews(client)
    await upsertContentPages(client)
    await upsertHomepageSections(client)
  })
}

let initPromise: Promise<void> | null = null

const ensureInitialized = (): Promise<void> => {
  if (dbUnavailable) {
    return Promise.resolve()
  }
  if (!initPromise) {
    initPromise = (async () => {
      try {
        await runMigrations()
        await seedArtifacts()
      } catch (error) {
        markDatabaseUnavailable(error)
      }
    })()
  }
  return initPromise
}

const executeQuery = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
  client?: PoolClient | Pool
): Promise<QueryResult<T>> => {
  const target = client ?? transactionClient ?? pool
  if (dbUnavailable) {
    throw new Error('database_unavailable')
  }
  return target.query<T>(text, values)
}

export const query = async <T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
  client?: PoolClient
): Promise<QueryResult<T>> => {
  await ensureInitialized()
  if (dbUnavailable) {
    throw new Error('database_unavailable')
  }
  return executeQuery<T>(text, values, client ?? undefined)
}

export const withTransaction = async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
  await ensureInitialized()
  if (dbUnavailable) {
    throw new Error('database_unavailable')
  }
  return runInTransaction(fn)
}

type PreparedMetadata = {
  text: string
  namedOrder: string[]
}

const prepareSql = (sql: string): PreparedMetadata => {
  const namedOrder: string[] = []
  const nameToIndex = new Map<string, number>()
  let index = 1

  const text = sql.replace(/(@[a-zA-Z_][a-zA-Z0-9_]*|\?)/g, (match) => {
    if (match === '?') {
      const placeholder = `$${index}`
      index += 1
      return placeholder
    }

    const name = match.slice(1)
    let placeholderIndex = nameToIndex.get(name)
    if (!placeholderIndex) {
      placeholderIndex = index
      nameToIndex.set(name, placeholderIndex)
      namedOrder.push(name)
      index += 1
    }
    return `$${placeholderIndex}`
  })

  return { text, namedOrder }
}

const normalizeParams = (meta: PreparedMetadata, args: unknown[]): unknown[] => {
  if (meta.namedOrder.length > 0) {
    const candidate = args[0]
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      const record = candidate as Record<string, unknown>
      return meta.namedOrder.map((key) => record[key])
    }
  }

  if (args.length === 1 && Array.isArray(args[0])) {
    return args[0] as unknown[]
  }

  return args
}

class PreparedStatement {
  private readonly meta: PreparedMetadata

  constructor(sql: string) {
    this.meta = prepareSql(sql)
  }

  private execute(args: unknown[]): { result: QueryResult<any>; lastInsertId: number } {
    const params = normalizeParams(this.meta, args)
    const runner = async (): Promise<{ result: QueryResult<any>; lastInsertId: number }> => {
      await ensureInitialized()
      if (dbUnavailable) {
        throw new Error('database_unavailable')
      }
      const client = transactionClient ?? (await pool.connect())
      let releaseClient = false
      if (!transactionClient) {
        releaseClient = true
      }
      try {
        const result = await client.query(this.meta.text, params)
        let lastInsertId = 0
        if (result.command === 'INSERT') {
          if (result.rows[0] && typeof result.rows[0] === 'object' && result.rows[0] !== null && 'id' in result.rows[0]) {
            lastInsertId = Number((result.rows[0] as Record<string, unknown>).id ?? 0)
          } else {
            try {
              const { rows } = await client.query<{ lastval: string | number }>('SELECT LASTVAL() AS lastval')
              const value = rows[0]?.lastval
              lastInsertId = typeof value === 'string' ? Number(value) : Number(value ?? 0)
            } catch {
              lastInsertId = 0
            }
          }
        }
        return { result, lastInsertId: Number.isNaN(lastInsertId) ? 0 : lastInsertId }
      } finally {
        if (releaseClient) {
          client.release()
        }
      }
    }

    return runBlocking(runner())
  }

  all<T = any>(...args: unknown[]): T[] {
    return this.execute(args).result.rows as T[]
  }

  get<T = any>(...args: unknown[]): T | undefined {
    const rows = this.execute(args).result.rows as T[]
    return rows[0]
  }

  run(...args: unknown[]): { changes: number; lastInsertRowid: number } {
    const { result, lastInsertId } = this.execute(args)
    return { changes: result.rowCount ?? 0, lastInsertRowid: lastInsertId }
  }
}

export const prepare = (sql: string): PreparedStatement => {
  return new PreparedStatement(sql)
}

export const transaction = <Args extends unknown[], Return>(
  fn: (...args: Args) => Return
): ((...args: Args) => Return) => {
  return (...args: Args): Return => {
    return runBlocking(
      runInTransaction(async (client) => {
        const previous = transactionClient
        transactionClient = client
        try {
          await ensureInitialized()
          if (dbUnavailable) {
            throw new Error('database_unavailable')
          }
          const result = fn(...args)
          return result instanceof Promise ? await result : result
        } finally {
          transactionClient = previous
        }
      })
    )
  }
}

export const ensureSeedData = (): void => {
  try {
    runBlocking(ensureInitialized())
  } catch (error) {
    markDatabaseUnavailable(error)
  }
}

export const ensureSchema = (): void => {
  try {
    runBlocking(ensureInitialized())
  } catch (error) {
    markDatabaseUnavailable(error)
  }
}

export const getPool = async (): Promise<Pool> => {
  await ensureInitialized()
  if (dbUnavailable) {
    throw new Error('database_unavailable')
  }
  return pool
}

try {
  runBlocking(ensureInitialized())
} catch (error) {
  markDatabaseUnavailable(error)
}

export const isDatabaseAvailable = (): boolean => !dbUnavailable

export default { query, prepare, transaction, withTransaction, ensureSchema, ensureSeedData, getPool, isDatabaseAvailable }
