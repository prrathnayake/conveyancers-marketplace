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
const customerRoles: ManagedUser['role'][] = ['buyer', 'seller']
const allowedQueryRoles = new Set([...allowedRoles, 'customer'])
const allowedStatuses = new Set(['active', 'suspended', 'invited'])
const customerContactMethods: Array<'email' | 'phone' | 'sms'> = ['email', 'phone', 'sms']

type DbUser = {
  id: number
  email: string
  full_name: string
  role: string
  status: string
  phone: string | null
  email_verified_at: string | null
  phone_verified_at: string | null
  is_verified: number
  created_at: string
  last_login_at: string | null
}

type ManagedUser = {
  id: number
  email: string
  fullName: string
  role: 'buyer' | 'seller' | 'conveyancer' | 'admin'
  status: 'active' | 'suspended' | 'invited'
  phone: string | null
  emailVerifiedAt: string | null
  phoneVerifiedAt: string | null
  overallVerified: boolean
  createdAt: string
  lastLoginAt: string | null
  jobStats: {
    total: number
    active: number
    completed: number
  }
  customerProfile: null | {
    preferredContactMethod: 'email' | 'phone' | 'sms'
    notes: string
  }
}

const sanitizeEmail = (value: string): string => value.trim().toLowerCase()
const sanitizeFullName = (value: string): string => value.replace(/\s+/g, ' ').trim()

const mapUser = (row: DbUser & {
  preferred_contact_method?: string | null
  notes?: string | null
  job_total?: number | null
  job_active?: number | null
  job_completed?: number | null
}): ManagedUser => {
  const base: ManagedUser = {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role as ManagedUser['role'],
    status: (row.status as ManagedUser['status']) ?? 'active',
    phone: row.phone ?? null,
    emailVerifiedAt: row.email_verified_at ?? null,
    phoneVerifiedAt: row.phone_verified_at ?? null,
    overallVerified: Boolean(row.is_verified),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    jobStats: {
      total: Number(row.job_total ?? 0),
      active: Number(row.job_active ?? 0),
      completed: Number(row.job_completed ?? 0),
    },
    customerProfile: null,
  }

  if (base.role === 'buyer' || base.role === 'seller') {
    const normalized = (row.preferred_contact_method ?? 'email').toLowerCase()
    const method = customerContactMethods.includes(normalized as (typeof customerContactMethods)[number])
      ? (normalized as (typeof customerContactMethods)[number])
      : 'email'
    base.customerProfile = {
      preferredContactMethod: method,
      notes: row.notes ?? '',
    }
  }

  return base
}

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
    `INSERT INTO conveyancer_profiles (user_id, firm_name, bio, phone, state, suburb, website)
     VALUES (?, '', '', '', '', '', '')
     ON CONFLICT(user_id) DO NOTHING`
  ).run(userId)
}

const deleteConveyancerProfile = (userId: number) => {
  db.prepare('DELETE FROM conveyancer_profiles WHERE user_id = ?').run(userId)
}

const ensureCustomerProfile = (userId: number, role: 'buyer' | 'seller') => {
  db.prepare(
    `INSERT INTO customer_profiles (user_id, role, preferred_contact_method, notes)
     VALUES (?, ?, 'email', '')
     ON CONFLICT(user_id) DO UPDATE SET role = excluded.role`
  ).run(userId, role)
}

const deleteCustomerProfile = (userId: number) => {
  db.prepare('DELETE FROM customer_profiles WHERE user_id = ?').run(userId)
}

const countActiveAdmins = (): number => {
  const row = db
    .prepare("SELECT COUNT(1) AS total FROM users WHERE role = 'admin' AND status = 'active'")
    .get() as { total: number }
  return Number(row.total ?? 0)
}

const normalizeSearch = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return undefined
  }
  return trimmed.slice(0, 100)
}

const listUsers = (filters: { role?: string; status?: string; search?: string }): ManagedUser[] => {
  const conditions: string[] = []
  const params: Array<string> = []
  if (filters.role && allowedQueryRoles.has(filters.role)) {
    if (filters.role === 'customer') {
      conditions.push(`role IN (${customerRoles.map(() => '?').join(', ')})`)
      params.push(...customerRoles)
    } else {
      conditions.push('role = ?')
      params.push(filters.role)
    }
  }
  if (filters.status && allowedStatuses.has(filters.status)) {
    conditions.push('status = ?')
    params.push(filters.status)
  }
  const search = normalizeSearch(filters.search)
  if (search) {
    const like = `%${search.toLowerCase()}%`
    conditions.push('(LOWER(u.full_name) LIKE ? OR LOWER(u.email) LIKE ? OR LOWER(cp.notes) LIKE ?)')
    params.push(like, like, like)
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = db
    .prepare(
      `SELECT u.id,
              u.email,
              u.full_name,
              u.role,
              u.status,
              u.phone,
              u.email_verified_at,
              u.phone_verified_at,
              u.is_verified,
              u.created_at,
              u.last_login_at,
              cp.preferred_contact_method,
              cp.notes,
              js.total_jobs AS job_total,
              js.active_jobs AS job_active,
              js.completed_jobs AS job_completed
         FROM users u
    LEFT JOIN customer_profiles cp ON cp.user_id = u.id
    LEFT JOIN (
          SELECT customer_id,
                 COUNT(*) AS total_jobs,
                 SUM(CASE WHEN status IN ('pending','in_progress') THEN 1 ELSE 0 END) AS active_jobs,
                 SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_jobs
            FROM customer_jobs
        GROUP BY customer_id
        ) js ON js.customer_id = u.id
        ${where}
     ORDER BY u.created_at DESC`
    )
    .all(
      ...params
    ) as Array<
      DbUser & {
        preferred_contact_method?: string | null
        notes?: string | null
        job_total?: number | null
        job_active?: number | null
        job_completed?: number | null
      }
    >
  return rows.map(mapUser)
}

const createUser = (payload: any, actor: SessionUser): { id: number; notify: string } => {
  const { email, fullName, role, password, status, customerProfile } = payload as {
    email?: string
    fullName?: string
    role?: string
    password?: string
    status?: string
    customerProfile?: {
      preferredContactMethod?: string
      notes?: string
    }
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
    } else if (role === 'buyer' || role === 'seller') {
      ensureCustomerProfile(userId, role)
    }
    if (customerProfile && (role === 'buyer' || role === 'seller')) {
      const contactMethod = (customerProfile.preferredContactMethod ?? 'email').toLowerCase()
      const method = customerContactMethods.includes(contactMethod as (typeof customerContactMethods)[number])
        ? (contactMethod as (typeof customerContactMethods)[number])
        : 'email'
      db.prepare(
        `UPDATE customer_profiles SET preferred_contact_method = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`
      ).run(method, (customerProfile.notes ?? '').trim(), userId)
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
  const { id, email, fullName, role, status, password, resetPassword, customerProfile } = payload as {
    id?: number
    email?: string
    fullName?: string
    role?: string
    status?: string
    password?: string
    resetPassword?: boolean
    customerProfile?: {
      preferredContactMethod?: string
      notes?: string
    }
  }

  if (!id || typeof id !== 'number') {
    throw new Error('invalid_payload')
  }

  const row = db
    .prepare(
      `SELECT u.email, u.full_name, u.role, u.status, cp.preferred_contact_method, cp.notes
         FROM users u
    LEFT JOIN customer_profiles cp ON cp.user_id = u.id
        WHERE u.id = ?`
    )
    .get(id) as
    | { email: string; full_name: string; role: string; status: string; preferred_contact_method?: string | null; notes?: string | null }
    | undefined

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
      if (nextRole === 'buyer' || nextRole === 'seller') {
        ensureCustomerProfile(id, nextRole)
      } else if (row.role === 'buyer' || row.role === 'seller') {
        deleteCustomerProfile(id)
      }
    }
    if (nextRole === 'buyer' || nextRole === 'seller') {
      ensureCustomerProfile(id, nextRole)
      if (customerProfile) {
        const contactMethod = (customerProfile.preferredContactMethod ?? 'email').toLowerCase()
        const method = customerContactMethods.includes(contactMethod as (typeof customerContactMethods)[number])
          ? (contactMethod as (typeof customerContactMethods)[number])
          : 'email'
        db.prepare(
          `UPDATE customer_profiles SET preferred_contact_method = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`
        ).run(method, (customerProfile.notes ?? '').trim(), id)
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
      const search = typeof req.query.search === 'string' ? req.query.search : undefined
      const users = listUsers({ role, status, search })
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
