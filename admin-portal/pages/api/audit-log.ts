import type { NextApiRequest, NextApiResponse } from 'next'

import db from '../../../frontend/lib/db'
import { requireRole } from '../../../frontend/lib/session'

type AuditRow = {
  id: number
  action: string
  entity: string
  entity_id: string
  metadata: string
  created_at: string
  actor_email: string | null
}

type AuditEntry = {
  id: number
  action: string
  entity: string
  details: string | null
  createdAt: string
  actorEmail: string | null
}

const handler = (req: NextApiRequest, res: NextApiResponse<AuditEntry[] | { error: string }>): void => {
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

  const entries = rows.map<AuditEntry>((row) => ({
    id: row.id,
    action: row.action,
    entity: row.entity,
    createdAt: row.created_at,
    actorEmail: row.actor_email,
    details: (() => {
      try {
        const parsed = JSON.parse(row.metadata)
        if (parsed && typeof parsed === 'object') {
          return JSON.stringify(parsed, null, 2)
        }
        return String(parsed)
      } catch {
        return row.metadata || null
      }
    })(),
  }))

  res.status(200).json(entries)
}

export default handler
