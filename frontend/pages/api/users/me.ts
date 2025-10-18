import type { NextApiRequest, NextApiResponse } from 'next'
import db from '../../../lib/db'
import { getUserById, requireAuth } from '../../../lib/session'

const handler = (req: NextApiRequest, res: NextApiResponse): void => {
  const user = requireAuth(req, res)
  if (!user) {
    return
  }

  if (req.method === 'GET') {
    const refreshed = getUserById(user.id)
    if (!refreshed) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    res.status(200).json(refreshed)
    return
  }

  if (req.method === 'PUT') {
    const { fullName } = req.body as { fullName?: string }
    if (!fullName || !fullName.trim()) {
      res.status(400).json({ error: 'invalid_full_name' })
      return
    }
    db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(fullName.trim(), user.id)
    res.status(200).json({ ok: true })
    return
  }

  res.setHeader('Allow', ['GET', 'PUT'])
  res.status(405).end('Method Not Allowed')
}

export default handler
