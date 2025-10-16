import type { NextApiRequest, NextApiResponse } from 'next'

import db from '../../../lib/db'

type SearchRow = {
  id: number
  full_name: string
  firm_name: string
  state: string
  suburb: string
  verified: number
  remote_friendly: number
  turnaround: string
  response_time: string
  specialties: string
  rating: number
  review_count: number
}

const parseSpecialties = (value: string): string[] => {
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string')
    }
  } catch {
    return []
  }
  return []
}

const searchProfiles = (q: string | undefined, state: string | undefined) => {
  const conditions: string[] = ['u.role = "conveyancer"']
  const params: Array<string | number> = []

  if (q) {
    conditions.push('(LOWER(u.full_name) LIKE ? OR LOWER(cp.firm_name) LIKE ? OR LOWER(cp.suburb) LIKE ?)')
    const like = `%${q.toLowerCase()}%`
    params.push(like, like, like)
  }

  if (state) {
    conditions.push('LOWER(cp.state) = ?')
    params.push(state.toLowerCase())
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const rows = db
    .prepare(
      `SELECT u.id, u.full_name, cp.firm_name, cp.state, cp.suburb, cp.verified, cp.remote_friendly, cp.turnaround,
              cp.response_time, cp.specialties,
              COALESCE(AVG(r.rating), 0) AS rating,
              COUNT(r.id) AS review_count
         FROM users u
         JOIN conveyancer_profiles cp ON cp.user_id = u.id
    LEFT JOIN conveyancer_reviews r ON r.conveyancer_id = u.id
        ${whereClause}
     GROUP BY u.id, cp.firm_name, cp.state, cp.suburb, cp.verified, cp.remote_friendly, cp.turnaround,
              cp.response_time, cp.specialties`
    )
    .all(...params) as SearchRow[]

  return rows.map((row) => ({
    id: `conveyancer_${row.id}`,
    name: row.firm_name || row.full_name,
    state: row.state,
    suburb: row.suburb,
    verified: Boolean(row.verified),
    rating: Number(row.rating ?? 0),
    reviewCount: Number(row.review_count ?? 0),
    turnaround: row.turnaround,
    specialties: parseSpecialties(row.specialties),
    remoteFriendly: Boolean(row.remote_friendly),
    responseTime: row.response_time,
  }))
}

const handler = (req: NextApiRequest, res: NextApiResponse): void => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const { q, state } = req.query
  const query = typeof q === 'string' ? q.trim() : undefined
  const stateFilter = typeof state === 'string' ? state.trim() : undefined

  const results = searchProfiles(query && query.length > 0 ? query : undefined, stateFilter && stateFilter.length > 0 ? stateFilter : undefined)
  res.status(200).json(results)
}

export default handler
