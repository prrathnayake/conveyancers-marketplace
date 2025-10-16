import type { NextApiRequest, NextApiResponse } from 'next'

import { recordAuditEvent } from '../../../lib/audit'
import db from '../../../lib/db'
import { notifyAdminChange } from '../../../lib/notifications'
import { requireRole } from '../../../lib/session'

type ReviewRecord = {
  id: number
  conveyancer_id: number
  reviewer_name: string
  rating: number
  comment: string
  created_at: string
}

const listReviews = (conveyancerId?: number) => {
  const base =
    'SELECT id, conveyancer_id, reviewer_name, rating, comment, created_at FROM conveyancer_reviews'
  if (conveyancerId) {
    return db
      .prepare(`${base} WHERE conveyancer_id = ? ORDER BY created_at DESC`)
      .all(conveyancerId) as ReviewRecord[]
  }
  return db.prepare(`${base} ORDER BY created_at DESC`).all() as ReviewRecord[]
}

const createReview = (payload: any) => {
  const { conveyancerId, reviewerName, rating, comment } = payload as {
    conveyancerId?: number
    reviewerName?: string
    rating?: number
    comment?: string
  }

  if (!conveyancerId || !reviewerName || !rating || !comment) {
    throw new Error('invalid_payload')
  }
  if (rating < 1 || rating > 5) {
    throw new Error('invalid_payload')
  }

  const exists = db
    .prepare('SELECT 1 FROM users WHERE id = ? AND role = "conveyancer"')
    .get(conveyancerId)
  if (!exists) {
    throw new Error('missing_conveyancer')
  }

  const info = db
    .prepare(
      'INSERT INTO conveyancer_reviews (conveyancer_id, reviewer_name, rating, comment) VALUES (?, ?, ?, ?)' 
    )
    .run(conveyancerId, reviewerName.trim(), rating, comment.trim())
  return Number(info.lastInsertRowid)
}

const deleteReview = (id: number) => {
  db.prepare('DELETE FROM conveyancer_reviews WHERE id = ?').run(id)
}

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const user = requireRole(req, res, ['admin'])
  if (!user) {
    return
  }

  try {
    if (req.method === 'GET') {
      const { conveyancerId } = req.query
      const numericId = typeof conveyancerId === 'string' ? Number(conveyancerId) : undefined
      const reviews = listReviews(Number.isFinite(numericId) ? numericId : undefined)
      res.status(200).json({ reviews })
      return
    }

    if (req.method === 'POST') {
      const id = createReview(req.body)
      recordAuditEvent(user, {
        action: 'create',
        entity: 'conveyancer_review',
        entityId: id,
        metadata: { conveyancerId: req.body?.conveyancerId },
      })
      await notifyAdminChange(`Review #${id} created by ${user.email}`)
      res.status(201).json({ id })
      return
    }

    if (req.method === 'DELETE') {
      const { id } = req.query
      const numericId = typeof id === 'string' ? Number(id) : NaN
      if (!numericId) {
        res.status(400).json({ error: 'invalid_id' })
        return
      }
      deleteReview(numericId)
      recordAuditEvent(user, { action: 'delete', entity: 'conveyancer_review', entityId: numericId })
      await notifyAdminChange(`Review #${numericId} deleted by ${user.email}`)
      res.status(200).json({ ok: true })
      return
    }

    res.setHeader('Allow', ['GET', 'POST', 'DELETE'])
    res.status(405).end('Method Not Allowed')
  } catch (error) {
    if (error instanceof Error && error.message === 'invalid_payload') {
      res.status(400).json({ error: 'invalid_payload' })
      return
    }
    if (error instanceof Error && error.message === 'missing_conveyancer') {
      res.status(404).json({ error: 'missing_conveyancer' })
      return
    }
    console.error('Admin reviews handler failed', error)
    res.status(500).json({ error: 'internal_error' })
  }
}

export default handler
