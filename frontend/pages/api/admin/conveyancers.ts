import type { NextApiRequest, NextApiResponse } from 'next'
import bcrypt from 'bcryptjs'

import { recordAuditEvent } from '../../../lib/audit'
import db from '../../../lib/db'
import { notifyAdminChange } from '../../../lib/notifications'
import { requireRole } from '../../../lib/session'

type ConveyancerRecord = {
  id: number
  email: string
  full_name: string
  firm_name: string
  bio: string
  phone: string
  state: string
  suburb: string
  website: string
  remote_friendly: number
  turnaround: string
  response_time: string
  specialties: string
  verified: number
  rating: number
  review_count: number
}

const serializeSpecialties = (value: unknown): string => {
  if (Array.isArray(value)) {
    const filtered = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    return JSON.stringify(filtered)
  }
  return JSON.stringify([])
}

const deserializeSpecialties = (value: string): string[] => {
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string')
    }
  } catch {
    // ignore parse error
  }
  return []
}

const listConveyancers = () => {
  const rows = db
    .prepare(
      `SELECT u.id, u.email, u.full_name, cp.firm_name, cp.bio, cp.phone, cp.state, cp.suburb, cp.website,
              cp.remote_friendly, cp.turnaround, cp.response_time, cp.specialties, cp.verified,
              COALESCE(AVG(r.rating), 0) AS rating, COUNT(r.id) AS review_count
         FROM users u
         JOIN conveyancer_profiles cp ON cp.user_id = u.id
    LEFT JOIN conveyancer_reviews r ON r.conveyancer_id = u.id
        WHERE u.role = 'conveyancer'
     GROUP BY u.id, cp.firm_name, cp.bio, cp.phone, cp.state, cp.suburb, cp.website,
              cp.remote_friendly, cp.turnaround, cp.response_time, cp.specialties, cp.verified
     ORDER BY u.created_at DESC`
    )
    .all() as ConveyancerRecord[]

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    firmName: row.firm_name,
    bio: row.bio,
    phone: row.phone,
    state: row.state,
    suburb: row.suburb,
    website: row.website,
    remoteFriendly: Boolean(row.remote_friendly),
    turnaround: row.turnaround,
    responseTime: row.response_time,
    specialties: deserializeSpecialties(row.specialties),
    verified: Boolean(row.verified),
    rating: Number(row.rating ?? 0),
    reviewCount: Number(row.review_count ?? 0),
  }))
}

const createConveyancer = (payload: any) => {
  const { email, fullName, password, profile } = payload as {
    email?: string
    fullName?: string
    password?: string
    profile?: Record<string, unknown>
  }

  if (!email || !fullName || !password || password.length < 12) {
    throw new Error('invalid_payload')
  }

  const normalizedEmail = email.trim().toLowerCase()
  const existing = db.prepare('SELECT 1 FROM users WHERE email = ?').get(normalizedEmail)
  if (existing) {
    throw new Error('email_in_use')
  }

  const tx = db.transaction(() => {
    const info = db
      .prepare('INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, ?, ?)')
      .run(normalizedEmail, bcrypt.hashSync(password, 12), 'conveyancer', fullName.trim())
    const userId = Number(info.lastInsertRowid)

    db.prepare(
      `INSERT INTO conveyancer_profiles
         (user_id, firm_name, bio, phone, state, suburb, website, remote_friendly, turnaround, response_time, specialties, verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      String(profile?.firmName ?? ''),
      String(profile?.bio ?? ''),
      String(profile?.phone ?? ''),
      String(profile?.state ?? ''),
      String(profile?.suburb ?? ''),
      String(profile?.website ?? ''),
      profile?.remoteFriendly ? 1 : 0,
      String(profile?.turnaround ?? ''),
      String(profile?.responseTime ?? ''),
      serializeSpecialties(profile?.specialties),
      profile?.verified ? 1 : 0
    )

    return userId
  })

  return tx()
}

const updateConveyancer = (payload: any) => {
  const { id, fullName, profile } = payload as {
    id?: number
    fullName?: string
    profile?: Record<string, unknown>
  }

  if (!id) {
    throw new Error('invalid_payload')
  }

  const tx = db.transaction(() => {
    if (fullName) {
      db.prepare('UPDATE users SET full_name = ? WHERE id = ? AND role = "conveyancer"').run(fullName.trim(), id)
    }

    if (profile) {
      db.prepare(
        `UPDATE conveyancer_profiles
            SET firm_name = COALESCE(?, firm_name),
                bio = COALESCE(?, bio),
                phone = COALESCE(?, phone),
                state = COALESCE(?, state),
                suburb = COALESCE(?, suburb),
                website = COALESCE(?, website),
                remote_friendly = COALESCE(?, remote_friendly),
                turnaround = COALESCE(?, turnaround),
                response_time = COALESCE(?, response_time),
                specialties = COALESCE(?, specialties),
                verified = COALESCE(?, verified)
          WHERE user_id = ?`
      ).run(
        profile.firmName ?? null,
        profile.bio ?? null,
        profile.phone ?? null,
        profile.state ?? null,
        profile.suburb ?? null,
        profile.website ?? null,
        typeof profile.remoteFriendly === 'boolean' ? (profile.remoteFriendly ? 1 : 0) : null,
        profile.turnaround ?? null,
        profile.responseTime ?? null,
        profile.specialties ? serializeSpecialties(profile.specialties) : null,
        typeof profile.verified === 'boolean' ? (profile.verified ? 1 : 0) : null,
        id
      )
    }
  })

  tx()
}

const deleteConveyancer = (id: number) => {
  db.prepare('DELETE FROM users WHERE id = ? AND role = "conveyancer"').run(id)
}

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const user = requireRole(req, res, ['admin'])
  if (!user) {
    return
  }

  try {
    if (req.method === 'GET') {
      const conveyancers = listConveyancers()
      res.status(200).json({ conveyancers })
      return
    }

    if (req.method === 'POST') {
      const id = createConveyancer(req.body)
      recordAuditEvent(user, { action: 'create', entity: 'conveyancer', entityId: id })
      await notifyAdminChange(`Conveyancer #${id} was created by ${user.email}`)
      res.status(201).json({ id })
      return
    }

    if (req.method === 'PUT') {
      updateConveyancer(req.body)
      recordAuditEvent(user, { action: 'update', entity: 'conveyancer', entityId: req.body?.id ?? 'unknown' })
      await notifyAdminChange(`Conveyancer #${req.body?.id ?? 'unknown'} was updated by ${user.email}`)
      res.status(200).json({ ok: true })
      return
    }

    if (req.method === 'DELETE') {
      const { id } = req.query
      const numericId = typeof id === 'string' ? Number(id) : NaN
      if (!numericId) {
        res.status(400).json({ error: 'invalid_id' })
        return
      }
      deleteConveyancer(numericId)
      recordAuditEvent(user, { action: 'delete', entity: 'conveyancer', entityId: numericId })
      await notifyAdminChange(`Conveyancer #${numericId} was removed by ${user.email}`)
      res.status(200).json({ ok: true })
      return
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE'])
    res.status(405).end('Method Not Allowed')
  } catch (error) {
    if (error instanceof Error && error.message === 'email_in_use') {
      res.status(409).json({ error: 'email_in_use' })
      return
    }
    if (error instanceof Error && error.message === 'invalid_payload') {
      res.status(400).json({ error: 'invalid_payload' })
      return
    }
    console.error('Admin conveyancer handler failed', error)
    res.status(500).json({ error: 'internal_error' })
  }
}

export default handler
