import type { NextApiRequest, NextApiResponse } from 'next'
import bcrypt from 'bcryptjs'
import db from '../../../lib/db'
import { createSessionCookie } from '../../../lib/session'

const allowedRoles = new Set(['buyer', 'seller', 'conveyancer'])

const ensureAdminSeeded = () => {
  const countStmt = db.prepare("SELECT COUNT(1) as total FROM users WHERE role = 'admin'")
  const { total } = countStmt.get() as { total: number }
  if (total === 0) {
    const adminEmail = process.env.DEFAULT_ADMIN_EMAIL
    const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD
    if (adminEmail && adminPassword) {
      const hash = bcrypt.hashSync(adminPassword, 12)
      db.prepare(
        'INSERT OR IGNORE INTO users (email, password_hash, role, full_name) VALUES (?, ?, ?, ?)'
      ).run(adminEmail.toLowerCase(), hash, 'admin', 'Platform Administrator')
    }
  }
}

type SignupRequest = {
  email?: string
  password?: string
  role?: string
  fullName?: string
}

const handler = (req: NextApiRequest, res: NextApiResponse): void => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    res.status(405).end('Method Not Allowed')
    return
  }

  ensureAdminSeeded()

  const { email, password, role, fullName } = req.body as SignupRequest

  if (!email || !password || !role || !fullName) {
    res.status(400).json({ error: 'missing_fields' })
    return
  }
  const trimmedEmail = email.trim().toLowerCase()
  const trimmedRole = role.trim().toLowerCase()
  if (!allowedRoles.has(trimmedRole)) {
    res.status(400).json({ error: 'invalid_role' })
    return
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'weak_password' })
    return
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(trimmedEmail)
  if (existing) {
    res.status(409).json({ error: 'email_in_use' })
    return
  }

  const passwordHash = bcrypt.hashSync(password, 12)
  const insert = db.prepare(
    'INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, ?, ?)'
  )
  const info = insert.run(trimmedEmail, passwordHash, trimmedRole, fullName.trim())
  const userId = Number(info.lastInsertRowid)

  if (trimmedRole === 'conveyancer') {
    db.prepare(
      'INSERT INTO conveyancer_profiles (user_id, firm_name, bio, phone, state, website) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userId, '', '', '', '', '')
  }

  const cookie = createSessionCookie({ sub: userId, role: trimmedRole as 'buyer' | 'seller' | 'conveyancer' })
  res.setHeader('Set-Cookie', cookie)
  res.status(201).json({ ok: true })
}

export default handler
