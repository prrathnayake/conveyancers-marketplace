import type { NextApiRequest, NextApiResponse } from 'next'

import db from '../../../frontend/lib/db'
import { requireRole } from '../../../frontend/lib/session'

type SummaryPayload = {
  conveyancers: number
  buyers: number
  sellers: number
  reviews: number
  lastAuditEvent?: {
    action: string
    entity: string
    actorEmail: string | null
    createdAt: string
  }
}

const handler = (req: NextApiRequest, res: NextApiResponse<SummaryPayload | { error: string }>): void => {
  const user = requireRole(req, res, ['admin'])
  if (!user) {
    return
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const conveyancers = db.prepare("SELECT COUNT(1) AS total FROM users WHERE role = 'conveyancer'").get() as { total: number }
  const buyers = db.prepare("SELECT COUNT(1) AS total FROM users WHERE role = 'buyer'").get() as { total: number }
  const sellers = db.prepare("SELECT COUNT(1) AS total FROM users WHERE role = 'seller'").get() as { total: number }
  const reviews = db.prepare('SELECT COUNT(1) AS total FROM conveyancer_reviews').get() as { total: number }

  const lastAudit = db
    .prepare(
      `SELECT a.action, a.entity, a.created_at, u.email as actor_email
         FROM admin_audit_log a
    LEFT JOIN users u ON u.id = a.actor_id
     ORDER BY a.created_at DESC
        LIMIT 1`
    )
    .get() as { action: string; entity: string; created_at: string; actor_email: string | null } | undefined

  res.status(200).json({
    conveyancers: conveyancers.total,
    buyers: buyers.total,
    sellers: sellers.total,
    reviews: reviews.total,
    lastAuditEvent: lastAudit
      ? {
          action: lastAudit.action,
          entity: lastAudit.entity,
          actorEmail: lastAudit.actor_email,
          createdAt: lastAudit.created_at,
        }
      : undefined,
  })
}

export default handler
