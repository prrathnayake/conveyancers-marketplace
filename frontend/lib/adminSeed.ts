import bcrypt from 'bcryptjs'

import db, { ensureSchema } from './db'

let seeded = false

const normalizeEmail = (email: string): string => email.trim().toLowerCase()

const MIN_PASSWORD_LENGTH = 12

const resolvePasswordHash = (plain: string | undefined, hash: string | undefined): string | null => {
  if (hash && hash.trim()) {
    return hash.trim()
  }

  if (!plain) {
    return null
  }

  if (plain.length < MIN_PASSWORD_LENGTH) {
    console.warn(
      `Administrator seed password is shorter than ${MIN_PASSWORD_LENGTH} characters; hashing anyway for local development`
    )
  }

  return bcrypt.hashSync(plain, 12)
}

export const ensureAdminSeeded = (): void => {
  ensureSchema()
  if (seeded) {
    return
  }

  const countStmt = db.prepare("SELECT COUNT(1) AS total FROM users WHERE role = 'admin'")
  const { total } = countStmt.get() as { total: number }
  if (total > 0) {
    seeded = true
    return
  }

  const seedEmail = process.env.ADMIN_SEED_EMAIL
  const seedPassword = process.env.ADMIN_SEED_PASSWORD
  const seedPasswordHash = process.env.ADMIN_SEED_PASSWORD_HASH

  if (!seedEmail) {
    console.warn('ADMIN_SEED_EMAIL is not configured; no administrator account was provisioned')
    return
  }

  const passwordHash = resolvePasswordHash(seedPassword, seedPasswordHash)
  if (!passwordHash) {
    console.warn('Administrator seed skipped because ADMIN_SEED_PASSWORD{,_HASH} is invalid or insecure')
    return
  }

  db.prepare(
    'INSERT OR IGNORE INTO users (email, password_hash, role, full_name) VALUES (?, ?, ?, ?)'
  ).run(normalizeEmail(seedEmail), passwordHash, 'admin', 'Platform Administrator')
  seeded = true
}

export default ensureAdminSeeded
