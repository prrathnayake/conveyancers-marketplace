import type { NextApiRequest, NextApiResponse } from 'next'

import db from '../../../lib/db'
import { requireRole } from '../../../lib/session'

type AuditRow = {
  id: number
  action: string
  entity: string
  entity_id: string
  metadata: string
  created_at: string
  actor_email: string | null
}

const handler = (req: NextApiRequest, res: NextApiResponse): void => {
  const user = requireRole(req, res, ['admin'])
  if (!user) {
    return
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const rows = db
    .prepare(
      `SELECT a.id, a.action, a.entity, a.entity_id, a.metadata, a.created_at, u.email AS actor_email
         FROM admin_audit_log a
    LEFT JOIN users u ON u.id = a.actor_id
     ORDER BY a.created_at DESC
        LIMIT 200`
    )
    .all() as AuditRow[]

  const entries = rows.map((row) => ({
    id: row.id,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    createdAt: row.created_at,
    actorEmail: row.actor_email,
    metadata: (() => {
      try {
        return JSON.parse(row.metadata)
      } catch {
        return {}
      }
    })(),
  }))

  res.status(200).json({ entries })
}

export default handler
