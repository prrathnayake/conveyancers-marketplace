import type { NextApiRequest, NextApiResponse } from 'next'
import bcrypt from 'bcryptjs'
import db from '../../../lib/db'
import { createSessionCookie } from '../../../lib/session'
import { ensureAdminSeeded } from '../../../lib/adminSeed'
import { logServerError, serializeError } from '../../../lib/serverLogger'

const allowedRoles = new Set(['buyer', 'seller', 'conveyancer'])

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

  try {
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

    console.info('User registered successfully', { email: trimmedEmail, role: trimmedRole })

    const cookie = createSessionCookie({
      sub: userId,
      role: trimmedRole as 'buyer' | 'seller' | 'conveyancer',
    })
    res.setHeader('Set-Cookie', cookie)
    res.status(201).json({ ok: true })
  } catch (error) {
    logServerError('Signup handler failed', {
      error: serializeError(error),
      endpoint: '/api/auth/signup',
      email: (req.body as SignupRequest)?.email ?? null,
    })
    res.status(500).json({ error: 'signup_failed' })
  }
}

export default handler
