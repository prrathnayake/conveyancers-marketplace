import type { NextApiRequest, NextApiResponse } from 'next'

import db from '../../../lib/db'
import { getSessionFromRequest } from '../../../lib/session'

const parseId = (value: string | string[] | undefined): number | null => {
  if (!value) {
    return null
  }
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) {
    return null
  }
  const match = raw.match(/^(?:conveyancer_)?(\d+)$/)
  if (!match) {
    return null
  }
  return Number(match[1])
}

const handler = (req: NextApiRequest, res: NextApiResponse): void => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    res.status(405).end('Method Not Allowed')
    return
  }

  const conveyancerId = parseId(req.query.id)
  if (!conveyancerId || Number.isNaN(conveyancerId)) {
    res.status(400).json({ error: 'invalid_id' })
    return
  }

  const row = db
    .prepare(
      `SELECT u.id, u.full_name, cp.firm_name, cp.bio, cp.phone, cp.state, cp.suburb, cp.website, cp.remote_friendly,
              cp.turnaround, cp.response_time, cp.specialties, cp.verified,
              COALESCE(AVG(r.rating), 0) AS rating, COUNT(r.id) AS review_count
         FROM users u
         JOIN conveyancer_profiles cp ON cp.user_id = u.id
    LEFT JOIN conveyancer_reviews r ON r.conveyancer_id = u.id
        WHERE u.id = ? AND u.role = 'conveyancer'
     GROUP BY u.id, cp.firm_name, cp.bio, cp.phone, cp.state, cp.suburb, cp.website, cp.remote_friendly,
              cp.turnaround, cp.response_time, cp.specialties, cp.verified`
    )
    .get(conveyancerId) as
      | {
          id: number
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
      | undefined

  if (!row) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  let specialties: string[] = []
  if (row.specialties) {
    try {
      const parsed = JSON.parse(row.specialties)
      if (Array.isArray(parsed)) {
        specialties = parsed.filter((item: unknown): item is string => typeof item === 'string')
      }
    } catch (error) {
      console.warn('Failed to parse specialties', error)
    }
  }

  const viewer = getSessionFromRequest(req)
  const revealPhone = Boolean(viewer && (viewer.role === 'admin' || viewer.id === row.id))

  res.status(200).json({
    id: `conveyancer_${row.id}`,
    userId: row.id,
    fullName: row.full_name,
    firmName: row.firm_name || row.full_name,
    bio: row.bio,
    state: row.state,
    suburb: row.suburb,
    website: row.website,
    remoteFriendly: Boolean(row.remote_friendly),
    turnaround: row.turnaround,
    responseTime: row.response_time,
    specialties,
    verified: Boolean(row.verified),
    rating: Number(row.rating ?? 0),
    reviewCount: Number(row.review_count ?? 0),
    contactPhone: revealPhone ? row.phone : null,
    hasContactAccess: revealPhone,
  })
}

export default handler
