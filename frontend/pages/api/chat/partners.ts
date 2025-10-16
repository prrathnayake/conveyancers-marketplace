import type { NextApiRequest, NextApiResponse } from 'next'
import db from '../../../lib/db'
import { requireAuth } from '../../../lib/session'

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

  let rows: Array<{ id: number; full_name: string; role: string }>
  switch (user.role) {
    case 'buyer':
    case 'seller':
      rows = db
        .prepare("SELECT id, full_name, role FROM users WHERE role = 'conveyancer' ORDER BY full_name ASC")
        .all() as Array<{ id: number; full_name: string; role: string }>
      break
    case 'conveyancer':
      rows = db
        .prepare("SELECT id, full_name, role FROM users WHERE role IN ('buyer','seller') ORDER BY full_name ASC")
        .all() as Array<{ id: number; full_name: string; role: string }>
      break
    case 'admin':
      rows = db
        .prepare("SELECT id, full_name, role FROM users WHERE id != ? ORDER BY full_name ASC")
        .all(user.id) as Array<{ id: number; full_name: string; role: string }>
      break
    default:
      rows = []
  }

  res.status(200).json({ partners: rows.map((row) => ({ id: row.id, fullName: row.full_name, role: row.role })) })
}

export default handler
