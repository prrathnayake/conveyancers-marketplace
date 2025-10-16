import type { NextApiRequest, NextApiResponse } from 'next'
import db from '../../../lib/db'
import { requireRole } from '../../../lib/session'

const handler = (req: NextApiRequest, res: NextApiResponse): void => {
  const user = requireRole(req, res, ['conveyancer', 'admin'])
  if (!user) {
    return
  }

  if (req.method === 'GET') {
    const profile = db
      .prepare(
        `SELECT firm_name, bio, phone, state, suburb, website, remote_friendly, turnaround, response_time, specialties, verified
           FROM conveyancer_profiles WHERE user_id = ?`
      )
      .get(user.id) as
      | {
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
        }
      | undefined

    res.status(200).json({
      firmName: profile?.firm_name ?? '',
      bio: profile?.bio ?? '',
      phone: profile?.phone ?? '',
      state: profile?.state ?? '',
      suburb: profile?.suburb ?? '',
      website: profile?.website ?? '',
      remoteFriendly: Boolean(profile?.remote_friendly),
      turnaround: profile?.turnaround ?? '',
      responseTime: profile?.response_time ?? '',
      specialties:
        profile?.specialties
          ? (() => {
              try {
                const parsed = JSON.parse(profile.specialties)
                return Array.isArray(parsed)
                  ? parsed.filter((item: unknown): item is string => typeof item === 'string')
                  : []
              } catch {
                return []
              }
            })()
          : [],
      verified: Boolean(profile?.verified),
    })
    return
  }

  if (req.method === 'PUT') {
    const { firmName, bio, phone, state, website, suburb, remoteFriendly, turnaround, responseTime, specialties, verified } =
      req.body as {
        firmName?: string
        bio?: string
        phone?: string
        state?: string
        website?: string
        suburb?: string
        remoteFriendly?: boolean
        turnaround?: string
        responseTime?: string
        specialties?: string[]
        verified?: boolean
      }

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO conveyancer_profiles
           (user_id, firm_name, bio, phone, state, suburb, website, remote_friendly, turnaround, response_time, specialties, verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      firm_name=excluded.firm_name,
      bio=excluded.bio,
      phone=excluded.phone,
      state=excluded.state,
      suburb=excluded.suburb,
      website=excluded.website,
      remote_friendly=excluded.remote_friendly,
      turnaround=excluded.turnaround,
      response_time=excluded.response_time,
      specialties=excluded.specialties,
      verified=excluded.verified`
      ).run(
        user.id,
        firmName ?? '',
        bio ?? '',
        phone ?? '',
        state ?? '',
        suburb ?? '',
        website ?? '',
        remoteFriendly ? 1 : 0,
        turnaround ?? '',
        responseTime ?? '',
        specialties ? JSON.stringify(specialties) : '[]',
        verified ? 1 : 0
      )
    })
    tx()

    res.status(200).json({ ok: true })
    return
  }

  res.setHeader('Allow', ['GET', 'PUT'])
  res.status(405).end('Method Not Allowed')
}

export default handler
