import type { NextApiRequest, NextApiResponse } from 'next'
import bcrypt from 'bcryptjs'

import db from '../../../frontend/lib/db'
import { requireRole } from '../../../frontend/lib/session'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const sanitizeFullName = (value: string): string => value.replace(/\s+/g, ' ').trim()

const handler = (req: NextApiRequest, res: NextApiResponse): void => {
  const sessionUser = requireRole(req, res, ['admin'])
  if (!sessionUser) {
    return
  }

  if (req.method === 'GET') {
    res.status(200).json({
      user: {
        id: sessionUser.id,
        email: sessionUser.email,
        fullName: sessionUser.fullName,
        role: sessionUser.role,
      },
    })
    return
  }

  if (req.method === 'PUT') {
    const { fullName, email, currentPassword, newPassword } = (req.body ?? {}) as {
      fullName?: string
      email?: string
      currentPassword?: string
      newPassword?: string | null
    }

    if (typeof fullName !== 'string' || typeof email !== 'string' || typeof currentPassword !== 'string') {
      res.status(400).json({ error: 'missing_profile_fields' })
      return
    }

    const normalizedFullName = sanitizeFullName(fullName)
    if (normalizedFullName.length < 2 || normalizedFullName.length > 120) {
      res.status(400).json({ error: 'invalid_full_name' })
      return
    }

    const normalizedEmail = email.trim().toLowerCase()
    if (!EMAIL_REGEX.test(normalizedEmail) || normalizedEmail.length > 254) {
      res.status(400).json({ error: 'invalid_email' })
      return
    }

    const currentPasswordValue = currentPassword.trim()
    if (currentPasswordValue.length < 8 || currentPasswordValue.length > 512) {
      res.status(400).json({ error: 'invalid_current_password' })
      return
    }

    const row = db
      .prepare('SELECT email, password_hash, full_name FROM users WHERE id = ?')
      .get(sessionUser.id) as { email: string; password_hash: string; full_name: string } | undefined

    if (!row) {
      res.status(404).json({ error: 'user_not_found' })
      return
    }

    const passwordMatches = bcrypt.compareSync(currentPasswordValue, row.password_hash)
    if (!passwordMatches) {
      res.status(400).json({ error: 'invalid_current_password' })
      return
    }

    const trimmedNewPassword = typeof newPassword === 'string' ? newPassword.trim() : ''
    let nextPasswordHash = row.password_hash
    const changedFields: string[] = []

    if (trimmedNewPassword.length > 0) {
      if (trimmedNewPassword.length < 12 || trimmedNewPassword.length > 128) {
        res.status(400).json({ error: 'invalid_new_password' })
        return
      }
      if (!/[A-Za-z]/.test(trimmedNewPassword) || !/\d/.test(trimmedNewPassword)) {
        res.status(400).json({ error: 'weak_new_password' })
        return
      }
      if (trimmedNewPassword === currentPasswordValue) {
        res.status(400).json({ error: 'password_reuse' })
        return
      }
      nextPasswordHash = bcrypt.hashSync(trimmedNewPassword, 12)
      changedFields.push('password')
    }

    if (normalizedEmail !== row.email) {
      const existing = db
        .prepare('SELECT id FROM users WHERE email = ? AND id != ?')
        .get(normalizedEmail, sessionUser.id) as { id: number } | undefined
      if (existing) {
        res.status(409).json({ error: 'email_in_use' })
        return
      }
      changedFields.push('email')
    }

    if (normalizedFullName !== row.full_name) {
      changedFields.push('full_name')
    }

    const tx = db.transaction(() => {
      db.prepare('UPDATE users SET email = ?, full_name = ?, password_hash = ? WHERE id = ?').run(
        normalizedEmail,
        normalizedFullName,
        nextPasswordHash,
        sessionUser.id
      )

      if (changedFields.length > 0) {
        db.prepare(
          'INSERT INTO admin_audit_log (actor_id, action, entity, entity_id, metadata) VALUES (?, ?, ?, ?, ?)' 
        ).run(
          sessionUser.id,
          'update_profile',
          'user',
          String(sessionUser.id),
          JSON.stringify({ changes: changedFields })
        )
      }
    })

    tx()

    res.status(200).json({
      user: {
        id: sessionUser.id,
        email: normalizedEmail,
        fullName: normalizedFullName,
        role: sessionUser.role,
      },
    })
    return
  }

  res.setHeader('Allow', ['GET', 'PUT'])
  res.status(405).end('Method Not Allowed')
}

export default handler
