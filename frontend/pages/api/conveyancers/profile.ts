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
        'SELECT firm_name, bio, phone, state, website FROM conveyancer_profiles WHERE user_id = ?'
      )
      .get(user.id) as { firm_name: string; bio: string; phone: string; state: string; website: string } | undefined

    res.status(200).json({
      firmName: profile?.firm_name ?? '',
      bio: profile?.bio ?? '',
      phone: profile?.phone ?? '',
      state: profile?.state ?? '',
      website: profile?.website ?? '',
    })
    return
  }

  if (req.method === 'PUT') {
    const { firmName, bio, phone, state, website } = req.body as {
      firmName?: string
      bio?: string
      phone?: string
      state?: string
      website?: string
    }

    const tx = db.transaction(() => {
      db.prepare(
        'INSERT INTO conveyancer_profiles (user_id, firm_name, bio, phone, state, website) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET firm_name=excluded.firm_name, bio=excluded.bio, phone=excluded.phone, state=excluded.state, website=excluded.website'
      ).run(user.id, firmName ?? '', bio ?? '', phone ?? '', state ?? '', website ?? '')
    })
    tx()

    res.status(200).json({ ok: true })
    return
  }

  res.setHeader('Allow', ['GET', 'PUT'])
  res.status(405).end('Method Not Allowed')
}

export default handler
