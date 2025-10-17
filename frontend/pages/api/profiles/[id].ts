import type { NextApiRequest, NextApiResponse } from 'next'

import db from '../../../lib/db'
import type { SessionUser } from '../../../lib/session'
import { getSessionFromRequest } from '../../../lib/session'

export const restrictedStates = new Set(['qld', 'act'])

export const parseId = (value: string | string[] | undefined): number | null => {
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

export type ConveyancerProfileRow = {
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

type ConveyancerJobHistoryRow = {
  matter_type: string
  completed_at: string
  location: string
  summary: string
  clients: string
}

type ConveyancerDocumentBadgeRow = {
  label: string
  status: string
  reference: string
  last_verified: string
  expires_at: string | null
}

export const isJurisdictionRestricted = (row: ConveyancerProfileRow): boolean => {
  return restrictedStates.has(row.state.toLowerCase()) && !row.verified
}

export const findConveyancerProfile = (conveyancerId: number): ConveyancerProfileRow | null => {
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
    .get(conveyancerId) as ConveyancerProfileRow | undefined

  return row ?? null
}

const parseSpecialties = (value: string): string[] => {
  if (!value) {
    return []
  }
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return parsed.filter((item: unknown): item is string => typeof item === 'string')
    }
  } catch (error) {
    console.warn('Failed to parse specialties', error)
  }
  return []
}

export const buildConveyancerProfile = (
  row: ConveyancerProfileRow,
  viewer: SessionUser | null,
  history: ConveyancerJobHistoryRow[] = [],
  badges: ConveyancerDocumentBadgeRow[] = [],
) => {
  const specialties = parseSpecialties(row.specialties)
  const restricted = isJurisdictionRestricted(row)
  const viewerCanBypass = Boolean(viewer && (viewer.role === 'admin' || viewer.id === row.id))
  const revealPhone = !restricted || viewerCanBypass

  return {
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
    jurisdictionRestricted: restricted,
    jobHistory: history.map((entry) => ({
      matterType: entry.matter_type,
      completedAt: entry.completed_at,
      location: entry.location,
      summary: entry.summary,
      clients: entry.clients,
    })),
    documentBadges: badges.map((badge) => ({
      label: badge.label,
      status: badge.status,
      reference: badge.reference,
      lastVerified: badge.last_verified,
      expiresAt: badge.expires_at,
    })),
  }
}

const listJobHistory = (conveyancerId: number): ConveyancerJobHistoryRow[] => {
  return db
    .prepare(
      `SELECT matter_type, completed_at, location, summary, clients
         FROM conveyancer_job_history
        WHERE conveyancer_id = ?
     ORDER BY datetime(completed_at) DESC
        LIMIT 10`
    )
    .all(conveyancerId) as ConveyancerJobHistoryRow[]
}

const listDocumentBadges = (conveyancerId: number): ConveyancerDocumentBadgeRow[] => {
  return db
    .prepare(
      `SELECT label, status, reference, last_verified, expires_at
         FROM conveyancer_document_badges
        WHERE conveyancer_id = ?
     ORDER BY datetime(last_verified) DESC`
    )
    .all(conveyancerId) as ConveyancerDocumentBadgeRow[]
}

export const getConveyancerJobHistory = (conveyancerId: number): ConveyancerJobHistoryRow[] => {
  return listJobHistory(conveyancerId)
}

export const getConveyancerDocumentBadges = (conveyancerId: number): ConveyancerDocumentBadgeRow[] => {
  return listDocumentBadges(conveyancerId)
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

  const row = findConveyancerProfile(conveyancerId)

  if (!row) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  const viewer = getSessionFromRequest(req)
  const restricted = isJurisdictionRestricted(row)
  const canAccessRestricted = Boolean(viewer && (viewer.role === 'admin' || viewer.id === row.id))
  if (restricted && !canAccessRestricted) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  const history = listJobHistory(conveyancerId)
  const badges = listDocumentBadges(conveyancerId)

  res.status(200).json(buildConveyancerProfile(row, viewer, history, badges))
}

export default handler
