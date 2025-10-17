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
db.pragma('journal_mode = WAL')

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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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
    }
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

  seedCustomerProfiles()
  seedConveyancerArtifacts()
  seedContentPages()
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
