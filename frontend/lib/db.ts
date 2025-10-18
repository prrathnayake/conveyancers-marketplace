import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

const findRepositoryRoot = (): string => {
  const markers = ['frontend', 'admin-portal']
  const candidates = [process.env.PLATFORM_REPOSITORY_ROOT, process.cwd(), __dirname]
    .filter((value): value is string => Boolean(value))
    .map((value) => path.resolve(value))

  const visited = new Set<string>()

  for (const start of candidates) {
    let current = start
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (visited.has(current)) {
        break
      }
      visited.add(current)

      const hasAllMarkers = markers.every((marker) =>
        fs.existsSync(path.join(current, marker))
      )
      if (hasAllMarkers) {
        return current
      }

      const parent = path.dirname(current)
      if (parent === current) {
        break
      }
      current = parent
    }
  }

  return path.resolve(process.cwd())
}

const resolveDatabaseLocation = (): { directory: string; file: string } => {
  const repositoryRoot = findRepositoryRoot()
  const override = process.env.PLATFORM_DATA_DIR

  if (override) {
    const resolvedOverride = path.isAbsolute(override)
      ? override
      : path.resolve(repositoryRoot, override)

    try {
      const stats = fs.statSync(resolvedOverride)
      if (stats.isFile()) {
        return {
          directory: path.dirname(resolvedOverride),
          file: resolvedOverride,
        }
      }
      if (stats.isDirectory()) {
        return {
          directory: resolvedOverride,
          file: path.join(resolvedOverride, 'app.db'),
        }
      }
    } catch {
      if (resolvedOverride.endsWith('.db')) {
        return {
          directory: path.dirname(resolvedOverride),
          file: resolvedOverride,
        }
      }
      return {
        directory: resolvedOverride,
        file: path.join(resolvedOverride, 'app.db'),
      }
    }
  }

  const directory = path.join(repositoryRoot, 'data')
  return { directory, file: path.join(directory, 'app.db') }
}

const { directory: databaseDirectory, file: databasePath } = resolveDatabaseLocation()

if (!fs.existsSync(databaseDirectory)) {
  fs.mkdirSync(databaseDirectory, { recursive: true })
}

const db = new Database(databasePath)

db.pragma('busy_timeout = 5000')

const ensureWalJournalMode = (): void => {
  try {
    db.pragma('journal_mode = WAL')
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: string }).code : undefined
    if (code !== 'SQLITE_BUSY') {
      throw error
    }
    // Another process is holding an exclusive lock. Continue with the default
    // journal mode so read operations can still succeed during builds.
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[db] Unable to enable WAL journal mode because the database is locked. Continuing with default journal mode.')
    }
  }
}

ensureWalJournalMode()

const applySchema = (): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('buyer','seller','conveyancer','admin')),
      full_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','invited')),
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
}

const ensureColumn = (table: string, column: string, ddl: string): void => {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  const exists = columns.some((entry) => entry.name === column)
  if (!exists) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${ddl}`).run()
  }
}

let schemaInitialized = false

export const ensureSchema = (): void => {
  if (schemaInitialized) {
    return
  }
  applySchema()
  ensureColumn('conveyancer_profiles', 'suburb', "suburb TEXT DEFAULT ''")
  ensureColumn('conveyancer_profiles', 'remote_friendly', 'remote_friendly INTEGER DEFAULT 0')
  ensureColumn('conveyancer_profiles', 'turnaround', "turnaround TEXT DEFAULT ''")
  ensureColumn('conveyancer_profiles', 'response_time', "response_time TEXT DEFAULT ''")
  ensureColumn('conveyancer_profiles', 'specialties', "specialties TEXT DEFAULT '[]'")
  ensureColumn('conveyancer_profiles', 'verified', 'verified INTEGER DEFAULT 0')
  ensureColumn(
    'users',
    'status',
    "status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','invited'))"
  )
  ensureColumn('users', 'last_login_at', 'last_login_at DATETIME')
  ensureColumn('service_catalogue', 'audience', "audience TEXT DEFAULT ''")
  ensureColumn('service_catalogue', 'preview_markdown', "preview_markdown TEXT DEFAULT ''")
  ensureColumn('service_catalogue', 'features', "features TEXT DEFAULT '[]'")
  ensureColumn('chat_invoices', 'refunded_cents', 'refunded_cents INTEGER DEFAULT 0')
  ensureColumn('document_signature_signers', 'created_at', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP')
  ensureColumn('conveyancer_reviews', 'job_reference', "job_reference TEXT DEFAULT ''")
  schemaInitialized = true
}

ensureSchema()

const seedArtifacts = (): void => {
  const seedCustomerProfiles = db.transaction(() => {
    const users = db
      .prepare("SELECT id, role FROM users WHERE role IN ('buyer','seller')")
      .all() as Array<{ id: number; role: 'buyer' | 'seller' }>
    const insert = db.prepare(
      `INSERT OR IGNORE INTO customer_profiles (user_id, role)
       VALUES (@id, @role)`
    )
    for (const user of users) {
      insert.run({ id: user.id, role: user.role })
    }
  })

  const seedConveyancerArtifacts = db.transaction(() => {
    const conveyancers = db
      .prepare('SELECT user_id FROM conveyancer_profiles')
      .all() as Array<{ user_id: number }>

    const countHistory = db.prepare(
      'SELECT COUNT(1) AS total FROM conveyancer_job_history WHERE conveyancer_id = ?'
    )
    const insertHistory = db.prepare(
      `INSERT INTO conveyancer_job_history (conveyancer_id, matter_type, completed_at, location, summary, clients)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    const countBadges = db.prepare(
      'SELECT COUNT(1) AS total FROM conveyancer_document_badges WHERE conveyancer_id = ?'
    )
    const insertBadge = db.prepare(
      `INSERT INTO conveyancer_document_badges (conveyancer_id, label, status, reference, last_verified, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    const countReviews = db.prepare(
      'SELECT COUNT(1) AS total FROM conveyancer_reviews WHERE conveyancer_id = ?'
    )
    const insertReview = db.prepare(
      `INSERT INTO conveyancer_reviews (conveyancer_id, reviewer_name, rating, comment, job_reference)
       VALUES (?, ?, ?, ?, ?)`
    )
    const countJobs = db.prepare(
      'SELECT COUNT(1) AS total FROM customer_jobs WHERE customer_id = ? AND conveyancer_id = ?'
    )
    const insertJob = db.prepare(
      `INSERT INTO customer_jobs (customer_id, conveyancer_id, status, reference, completed_at)
       VALUES (?, ?, 'completed', ?, ?)`
    )

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

    const customers = db
      .prepare("SELECT id FROM users WHERE role IN ('buyer','seller') ORDER BY id LIMIT 6")
      .all() as Array<{ id: number }>
    let customerCursor = 0

    for (const { user_id: conveyancerId } of conveyancers) {
      const historyCount = countHistory.get(conveyancerId) as { total?: number }
      if (!historyCount?.total) {
        insertHistory.run(
          conveyancerId,
          'Residential purchase',
          iso(30),
          'Melbourne, VIC',
          'Coordinated finance approval and title registration within 21 days.',
          'Buyer & lender'
        )
        insertHistory.run(
          conveyancerId,
          'Off-the-plan settlement',
          iso(75),
          'Brisbane, QLD',
          'Managed variation deeds and final inspection issues before settlement.',
          'Developer & purchaser'
        )
      }

      const badgeCount = countBadges.get(conveyancerId) as { total?: number }
      if (!badgeCount?.total) {
        insertBadge.run(
          conveyancerId,
          'Professional indemnity insurance',
          'valid',
          `PI-${conveyancerId}`,
          iso(14),
          expires(180)
        )
        insertBadge.run(
          conveyancerId,
          'National police check',
          'valid',
          `NPC-${conveyancerId}`,
          iso(30),
          expires(365)
        )
      }

      const reviewCount = countReviews.get(conveyancerId) as { total?: number }
      if (!reviewCount?.total) {
        const jobRefOne = `JOB-${conveyancerId}-01`
        const jobRefTwo = `JOB-${conveyancerId}-02`
        insertReview.run(
          conveyancerId,
          'Verified buyer',
          5,
          'Transparent milestones and proactive updates made the purchase straightforward.',
          jobRefOne
        )
        insertReview.run(
          conveyancerId,
          'Settlement partner',
          4,
          'Responsive communication and strong compliance hygiene across every step.',
          jobRefTwo
        )

        if (customers.length > 0) {
          const firstCustomer = customers[customerCursor % customers.length]
          const secondCustomer = customers[(customerCursor + 1) % customers.length]
          customerCursor = (customerCursor + 2) % customers.length

          const existingFirst = countJobs.get(firstCustomer.id, conveyancerId) as { total?: number }
          if (!existingFirst?.total) {
            insertJob.run(firstCustomer.id, conveyancerId, jobRefOne, iso(12))
          }

          const existingSecond = countJobs.get(secondCustomer.id, conveyancerId) as { total?: number }
          if (!existingSecond?.total) {
            insertJob.run(secondCustomer.id, conveyancerId, jobRefTwo, iso(18))
          }
        }
      }
    }
  })

  const seedProductReviews = db.transaction(() => {
    const total = db.prepare('SELECT COUNT(1) AS total FROM product_reviews').get() as { total?: number }
    if (total?.total) {
      return
    }

    const insert = db.prepare(
      `INSERT INTO product_reviews (reviewer_name, rating, comment, created_at)
       VALUES (?, ?, ?, ?)`
    )

    const now = new Date()
    const iso = (offsetDays: number): string => {
      const copy = new Date(now.getTime())
      copy.setDate(copy.getDate() - offsetDays)
      return copy.toISOString()
    }

    insert.run(
      'Harper • Buyer',
      5,
      'The Conveyancers Marketplace platform kept every milestone visible and approvals were effortless.',
      iso(4)
    )
    insert.run(
      'Mason • Seller',
      4,
      'Escrow tracking and document badges gave us confidence while we negotiated tight deadlines.',
      iso(9)
    )
    insert.run(
      'Avery • Conveyancer',
      5,
      'Secure messaging, quote management, and audit logs made collaboration with clients seamless.',
      iso(15)
    )
    insert.run(
      'Jordan • Buyer',
      5,
      'Receiving automated alerts for every settlement step meant no surprises ahead of completion.',
      iso(21)
    )
    insert.run(
      'Quinn • Lender partner',
      5,
      'Document verification and milestone controls reduced settlement risk across our loan book.',
      iso(32)
    )
  })

  const seedContentPages = db.transaction(() => {
    const upsert = db.prepare(
      `INSERT INTO content_pages (slug, title, body, meta_description)
       VALUES (@slug, @title, @body, @meta_description)
       ON CONFLICT(slug) DO UPDATE SET
         title = excluded.title,
         body = excluded.body,
         meta_description = excluded.meta_description,
         updated_at = CURRENT_TIMESTAMP`
    )

    upsert.run({
      slug: 'about-us',
      title: 'About Conveyancers Marketplace',
      body:
        '## About us\nConveyancers Marketplace unites licenced professionals, buyers, sellers, and lenders in one settlement workspace.\n\n### Our mission\nDeliver compliant, collaborative settlements that keep every milestone visible.\n\n### How we work\nWe partner with firms across Australia to align regulatory guardrails with client experience.\n\n### Where we operate\nSydney and Melbourne hubs with practitioners servicing every state and territory.\n\n### Join the team\nContact careers@conveyancers.market to explore current opportunities.',
      meta_description:
        'Discover the Conveyancers Marketplace team and how the ConveySafe assurance network supports compliant settlements.',
    })

    upsert.run({
      slug: 'contact-us',
      title: 'Talk with the ConveySafe team',
      body:
        '## Contact us\nWe are available 7 days a week to help buyers, sellers, conveyancers, and partners.\n\n- **Email:** support@conveyancers.market\n- **Phone:** 1300 555 019 (8am – 8pm AEST)\n- **Compliance escalation:** compliance@conveysafe.au\n\nLooking for press enquiries? Reach out to press@conveyancers.market.',
      meta_description:
        'Reach the ConveySafe operations and compliance teams for settlement assistance, partnership opportunities, or media enquiries.',
    })

    upsert.run({
      slug: 'home',
      title: 'Conveyancers Marketplace',
      body: 'Homepage content is managed within the application.',
      meta_description:
        'Conveyancers Marketplace connects buyers, sellers, and licenced professionals with ConveySafe compliance, escrow, and collaboration tools.',
    })
  })

  const seedHomepageSections = db.transaction(() => {
    const upsert = db.prepare(
      `INSERT INTO homepage_sections (key, content, updated_at)
       VALUES (@key, @content, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET
         content = excluded.content,
         updated_at = CURRENT_TIMESTAMP`
    )

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

    upsert.run({ key: 'hero', content: JSON.stringify(hero) })
    upsert.run({ key: 'personas', content: JSON.stringify(personas) })
    upsert.run({ key: 'workflow', content: JSON.stringify(workflow) })
    upsert.run({ key: 'resources', content: JSON.stringify(resources) })
    upsert.run({ key: 'faqs', content: JSON.stringify(faqs) })
    upsert.run({ key: 'copy', content: JSON.stringify(copy) })
    upsert.run({ key: 'cta', content: JSON.stringify(cta) })
  })

  seedCustomerProfiles()
  seedConveyancerArtifacts()
  seedProductReviews()
  seedContentPages()
  seedHomepageSections()
}

let artifactsSeeded = false

export const ensureSeedData = (): void => {
  if (artifactsSeeded) {
    return
  }
  seedArtifacts()
  artifactsSeeded = true
}

ensureSeedData()

export default db
