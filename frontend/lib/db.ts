import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

const resolveDataDirectory = (): string => {
  if (process.env.PLATFORM_DATA_DIR) {
    return path.resolve(process.cwd(), process.env.PLATFORM_DATA_DIR)
  }

  const cwd = process.cwd()
  const normalized = cwd.replace(/\\/g, '/')
  if (normalized.includes('/admin-portal')) {
    return path.resolve(cwd, '../frontend/data')
  }

  return path.join(cwd, 'data')
}

const databaseDirectory = resolveDataDirectory()
const databasePath = path.join(databaseDirectory, 'app.db')

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
  ensureColumn('service_catalogue', 'audience', "audience TEXT DEFAULT ''")
  ensureColumn('service_catalogue', 'preview_markdown', "preview_markdown TEXT DEFAULT ''")
  ensureColumn('service_catalogue', 'features', "features TEXT DEFAULT '[]'")
  schemaInitialized = true
}

ensureSchema()

export default db
