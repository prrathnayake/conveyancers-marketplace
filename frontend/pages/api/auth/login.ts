import type { NextApiResponse } from 'next'
import bcrypt from 'bcryptjs'
import db from '../../../lib/db'
import { createSessionCookie, createRefreshCookie, type SessionUser } from '../../../lib/session'
import { ensureAdminSeeded } from '../../../lib/adminSeed'
import { issueRefreshToken } from '../../../lib/authTokens'
import { withObservability, type ObservedRequest } from '../../../lib/observability'

const handler = (req: ObservedRequest, res: NextApiResponse): void => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    res.status(405).end('Method Not Allowed')
    return
  }

  ensureAdminSeeded()

  const { email, password } = req.body as { email?: string; password?: string }
  if (!email || !password) {
    res.status(400).json({ error: 'missing_fields' })
    return
  }

  const stmt = db.prepare(
    'SELECT id, password_hash, role, status FROM users WHERE email = ?'
  )
  const user = stmt.get(email.trim().toLowerCase()) as
    | { id: number; password_hash: string; role: string; status: string }
    | undefined
  if (!user) {
    res.status(401).json({ error: 'invalid_credentials' })
    return
  }

  if (user.status !== 'active') {
    res.status(403).json({ error: 'account_inactive' })
    return
  }

  const valid = bcrypt.compareSync(password, user.password_hash)
  if (!valid) {
    res.status(401).json({ error: 'invalid_credentials' })
    return
  }

  const { token: refreshToken, expiresAt } = issueRefreshToken(user.id)
  const sessionCookie = createSessionCookie({
    sub: user.id,
    role: user.role as SessionUser['role'],
  })
  const refreshCookie = createRefreshCookie(refreshToken, expiresAt)

  db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id)
  res.setHeader('Set-Cookie', [sessionCookie, refreshCookie])
  res.status(200).json({ ok: true, expiresAt })
}

export default withObservability(handler, { feature: 'auth_login' })
