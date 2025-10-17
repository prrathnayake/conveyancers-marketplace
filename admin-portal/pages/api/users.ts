import type { NextApiRequest, NextApiResponse } from 'next'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

import { recordAuditEvent } from '../../../frontend/lib/audit'
import db from '../../../frontend/lib/db'
import { notifyAdminChange } from '../../../frontend/lib/notifications'
import { requireRole, type SessionUser } from '../../../frontend/lib/session'
import { logServerError, serializeError } from '../../../frontend/lib/serverLogger'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const allowedRoles = new Set(['buyer', 'seller', 'conveyancer', 'admin'])
const allowedStatuses = new Set(['active', 'suspended', 'invited'])

type DbUser = {
  id: number
  email: string
  full_name: string
  role: string
  status: string
  created_at: string
  last_login_at: string | null
}

type ManagedUser = {
  id: number
  email: string
  fullName: string
  role: 'buyer' | 'seller' | 'conveyancer' | 'admin'
  status: 'active' | 'suspended' | 'invited'
  createdAt: string
  lastLoginAt: string | null
}

const sanitizeEmail = (value: string): string => value.trim().toLowerCase()
const sanitizeFullName = (value: string): string => value.replace(/\s+/g, ' ').trim()

const mapUser = (row: DbUser): ManagedUser => ({
  id: row.id,
  email: row.email,
  fullName: row.full_name,
  role: row.role as ManagedUser['role'],
  status: (row.status as ManagedUser['status']) ?? 'active',
  createdAt: row.created_at,
  lastLoginAt: row.last_login_at,
})

const generatePassword = (): string => {
  let candidate = crypto.randomBytes(16).toString('base64').replace(/[^A-Za-z0-9]/g, '')
  while (candidate.length < 16 || !/[A-Za-z]/.test(candidate) || !/\d/.test(candidate)) {
    candidate += crypto.randomBytes(4).toString('base64').replace(/[^A-Za-z0-9]/g, '')
    candidate = candidate.slice(0, 20)
  }
  return candidate.slice(0, 20)
}

const ensureConveyancerProfile = (userId: number) => {
  db.prepare(
    `INSERT OR IGNORE INTO conveyancer_profiles (user_id, firm_name, bio, phone, state, suburb, website)
     VALUES (?, '', '', '', '', '', '')`
  ).run(userId)
}

const deleteConveyancerProfile = (userId: number) => {
  db.prepare('DELETE FROM conveyancer_profiles WHERE user_id = ?').run(userId)
}

const countActiveAdmins = (): number => {
  const row = db
    .prepare("SELECT COUNT(1) AS total FROM users WHERE role = 'admin' AND status = 'active'")
    .get() as { total: number }
  return Number(row.total ?? 0)
}

const listUsers = (filters: { role?: string; status?: string }): ManagedUser[] => {
  const conditions: string[] = []
  const params: Array<string> = []
  if (filters.role && allowedRoles.has(filters.role)) {
    conditions.push('role = ?')
    params.push(filters.role)
  }
  if (filters.status && allowedStatuses.has(filters.status)) {
    conditions.push('status = ?')
    params.push(filters.status)
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = db
    .prepare(
      `SELECT id, email, full_name, role, status, created_at, last_login_at
         FROM users
        ${where}
     ORDER BY created_at DESC`
    )
    .all(...params) as DbUser[]
  return rows.map(mapUser)
}

const createUser = (payload: any, actor: SessionUser): { id: number; notify: string } => {
  const { email, fullName, role, password, status } = payload as {
    email?: string
    fullName?: string
    role?: string
    password?: string
    status?: string
  }

  if (!email || !fullName || !role || !password) {
    throw new Error('invalid_payload')
  }

  const normalizedEmail = sanitizeEmail(email)
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    throw new Error('invalid_email')
  }

  if (!allowedRoles.has(role)) {
    throw new Error('invalid_role')
  }

  const normalizedFullName = sanitizeFullName(fullName)
  if (normalizedFullName.length < 2) {
    throw new Error('invalid_full_name')
  }

  if (password.length < 12 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('weak_password')
  }

  const desiredStatus = status && allowedStatuses.has(status) ? status : 'active'

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail) as { id: number } | undefined
  if (existing) {
    throw new Error('email_in_use')
  }

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        'INSERT INTO users (email, password_hash, role, full_name, status) VALUES (?, ?, ?, ?, ?)' 
      )
      .run(normalizedEmail, bcrypt.hashSync(password, 12), role, normalizedFullName, desiredStatus)
    const userId = Number(info.lastInsertRowid)
    if (role === 'conveyancer') {
      ensureConveyancerProfile(userId)
    }
    return userId
  })

  const id = tx()
  recordAuditEvent(actor, { action: 'create', entity: 'user', entityId: id })
  return { id, notify: `User #${id} (${normalizedEmail}) created by ${actor.email}` }
}

const updateUser = (
  payload: any,
  actor: SessionUser
): { id: number; password?: string; notify?: string } => {
  const { id, email, fullName, role, status, password, resetPassword } = payload as {
    id?: number
    email?: string
    fullName?: string
    role?: string
    status?: string
    password?: string
    resetPassword?: boolean
  }

  if (!id || typeof id !== 'number') {
    throw new Error('invalid_payload')
  }

  const row = db
    .prepare('SELECT email, full_name, role, status FROM users WHERE id = ?')
    .get(id) as { email: string; full_name: string; role: string; status: string } | undefined

  if (!row) {
    throw new Error('not_found')
  }

  const updates: string[] = []
  const params: unknown[] = []
  let generatedPassword: string | undefined

  if (email) {
    const normalizedEmail = sanitizeEmail(email)
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      throw new Error('invalid_email')
    }
    if (normalizedEmail !== row.email) {
      const existing = db
        .prepare('SELECT id FROM users WHERE email = ? AND id != ?')
        .get(normalizedEmail, id) as { id: number } | undefined
      if (existing) {
        throw new Error('email_in_use')
      }
      updates.push('email = ?')
      params.push(normalizedEmail)
    }
  }

  if (fullName) {
    const normalizedFullName = sanitizeFullName(fullName)
    if (normalizedFullName.length < 2) {
      throw new Error('invalid_full_name')
    }
    if (normalizedFullName !== row.full_name) {
      updates.push('full_name = ?')
      params.push(normalizedFullName)
    }
  }

  let nextRole = row.role
  if (role) {
    if (!allowedRoles.has(role)) {
      throw new Error('invalid_role')
    }
    if (actor.id === id && role !== 'admin') {
      throw new Error('self_lockout')
    }
    nextRole = role
    if (role !== row.role) {
      if (row.role === 'admin' && role !== 'admin') {
        if (countActiveAdmins() <= 1) {
          throw new Error('admin_required')
        }
      }
      updates.push('role = ?')
      params.push(role)
    }
  }

  if (status) {
    if (!allowedStatuses.has(status)) {
      throw new Error('invalid_status')
    }
    if (actor.id === id && status !== 'active') {
      throw new Error('self_lockout')
    }
    if (row.role === 'admin' && status !== 'active') {
      if (countActiveAdmins() <= 1) {
        throw new Error('admin_required')
      }
    }
    if (status !== row.status) {
      updates.push('status = ?')
      params.push(status)
    }
  }

  if (password) {
    if (password.length < 12 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new Error('weak_password')
    }
    updates.push('password_hash = ?')
    params.push(bcrypt.hashSync(password, 12))
  } else if (resetPassword) {
    generatedPassword = generatePassword()
    updates.push('password_hash = ?')
    params.push(bcrypt.hashSync(generatedPassword, 12))
  }

  if (updates.length === 0) {
    return { id }
  }

  const updateParams = [...params, id]
  db.transaction(() => {
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...updateParams)
    if (row.role !== nextRole) {
      if (nextRole === 'conveyancer') {
        ensureConveyancerProfile(id)
      } else if (row.role === 'conveyancer') {
        deleteConveyancerProfile(id)
      }
    }
  })()

  recordAuditEvent(actor, {
    action: 'update',
    entity: 'user',
    entityId: id,
    metadata: {
      changes: updates.map((entry) => entry.split('=')[0]?.trim()),
      resetPassword: Boolean(generatedPassword),
    },
  })
  const response: { id: number; password?: string; notify?: string } = {
    id,
    notify: `User #${id} updated by ${actor.email}`,
  }
  if (generatedPassword) {
    response.password = generatedPassword
  }
  return response
}

const deleteUser = (id: number, actor: SessionUser): string => {
  if (actor.id === id) {
    throw new Error('cannot_delete_self')
  }
  const row = db
    .prepare('SELECT role, email FROM users WHERE id = ?')
    .get(id) as { role: string; email: string } | undefined
  if (!row) {
    throw new Error('not_found')
  }
  if (row.role === 'admin' && countActiveAdmins() <= 1) {
    throw new Error('admin_required')
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
  recordAuditEvent(actor, { action: 'delete', entity: 'user', entityId: id })
  return `User #${id} (${row.email}) deleted by ${actor.email}`
}

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const actor = requireRole(req, res, ['admin'])
  if (!actor) {
    return
  }

  try {
    if (req.method === 'GET') {
      const role = typeof req.query.role === 'string' ? req.query.role : undefined
      const status = typeof req.query.status === 'string' ? req.query.status : undefined
      const users = listUsers({ role, status })
      res.status(200).json(users)
      return
    }

    if (req.method === 'POST') {
      const result = createUser(req.body, actor)
      await notifyAdminChange(result.notify)
      res.status(201).json({ id: result.id })
      return
    }

    if (req.method === 'PUT') {
      const result = updateUser(req.body, actor)
      if (result.notify) {
        await notifyAdminChange(result.notify)
      }
      res.status(200).json({ id: result.id, password: result.password })
      return
    }

    if (req.method === 'DELETE') {
      const { id } = req.query
      const numericId = typeof id === 'string' ? Number(id) : NaN
      if (!numericId) {
        res.status(400).json({ error: 'invalid_id' })
        return
      }
      const message = deleteUser(numericId, actor)
      await notifyAdminChange(message)
      res.status(200).json({ ok: true })
      return
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE'])
    res.status(405).end('Method Not Allowed')
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'email_in_use') {
        res.status(409).json({ error: 'email_in_use' })
        return
      }
      const knownErrors = [
        'invalid_payload',
        'invalid_email',
        'invalid_role',
        'invalid_full_name',
        'weak_password',
        'email_in_use',
        'not_found',
        'invalid_status',
        'self_lockout',
        'admin_required',
        'cannot_delete_self',
      ]
      if (knownErrors.includes(error.message)) {
        res.status(400).json({ error: error.message })
        return
      }
    }
    logServerError('Admin users handler failed', {
      error: serializeError(error),
      endpoint: '/api/users',
      method: req.method,
      body: req.body,
      query: req.query,
    })
    res.status(500).json({ error: 'internal_error' })
  }
}

export default handler
