import type { NextApiRequest, NextApiResponse } from 'next'
import bcrypt from 'bcryptjs'
import db from '../../../lib/db'
import { createSessionCookie } from '../../../lib/session'
import { ensureAdminSeeded } from '../../../lib/adminSeed'

const handler = (req: NextApiRequest, res: NextApiResponse): void => {
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

  const stmt = db.prepare('SELECT id, password_hash, role FROM users WHERE email = ?')
  const user = stmt.get(email.trim().toLowerCase()) as { id: number; password_hash: string; role: string } | undefined
  if (!user) {
    res.status(401).json({ error: 'invalid_credentials' })
    return
  }

  const valid = bcrypt.compareSync(password, user.password_hash)
  if (!valid) {
    res.status(401).json({ error: 'invalid_credentials' })
    return
  }

  const cookie = createSessionCookie({ sub: user.id, role: user.role as 'buyer' | 'seller' | 'conveyancer' | 'admin' })
  res.setHeader('Set-Cookie', cookie)
  res.status(200).json({ ok: true })
}

export default handler
