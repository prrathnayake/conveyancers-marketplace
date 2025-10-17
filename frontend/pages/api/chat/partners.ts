import type { NextApiRequest, NextApiResponse } from 'next'
import db from '../../../lib/db'
import { requireAuth } from '../../../lib/session'
import { listParticipants } from '../../../lib/conversations'

const handler = (req: NextApiRequest, res: NextApiResponse): void => {
  const user = requireAuth(req, res)
  if (!user) {
    return
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    res.status(405).end('Method Not Allowed')
    return
  }

  const conversations = listParticipants(user.id)
  const partnerIds = Array.from(
    new Set(
      conversations.map((conversation) =>
        conversation.participantA === user.id ? conversation.participantB : conversation.participantA,
      ),
    ),
  ).filter((id) => id !== user.id)

  if (partnerIds.length === 0) {
    res.status(200).json({ partners: [] })
    return
  }

  const placeholders = partnerIds.map(() => '?').join(', ')
  const rows = db
    .prepare(`SELECT id, full_name, role FROM users WHERE id IN (${placeholders}) ORDER BY full_name ASC`)
    .all(...partnerIds) as Array<{ id: number; full_name: string; role: string }>

  res.status(200).json({ partners: rows.map((row) => ({ id: row.id, fullName: row.full_name, role: row.role })) })
}

export default handler
