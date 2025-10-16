import type { NextApiRequest, NextApiResponse } from 'next'

import db from '../../../lib/db'
import { requireRole } from '../../../lib/session'

type ReviewPayload = {
  id: number
  reviewerName: string
  rating: number
  comment: string
  createdAt: string
}

const getReviews = (conveyancerId: number): ReviewPayload[] => {
  return db
    .prepare(
      `SELECT id, reviewer_name, rating, comment, created_at
         FROM conveyancer_reviews
        WHERE conveyancer_id = ?
     ORDER BY created_at DESC`
    )
    .all(conveyancerId)
    .map((row: any) => ({
      id: row.id as number,
      reviewerName: row.reviewer_name as string,
      rating: row.rating as number,
      comment: row.comment as string,
      createdAt: row.created_at as string,
    }))
}

const handler = (req: NextApiRequest, res: NextApiResponse): void => {
  if (req.method === 'GET') {
    const { conveyancerId } = req.query
    const numericId = typeof conveyancerId === 'string' ? Number(conveyancerId) : NaN
    if (!numericId) {
      res.status(400).json({ error: 'invalid_conveyancer' })
      return
    }
    res.status(200).json({ reviews: getReviews(numericId) })
    return
  }

  if (req.method === 'POST') {
    const user = requireRole(req, res, ['buyer', 'seller'])
    if (!user) {
      return
    }
    const { conveyancerId, reviewerName, rating, comment } = req.body as {
      conveyancerId?: number
      reviewerName?: string
      rating?: number
      comment?: string
    }
    if (!conveyancerId || !rating || !comment) {
      res.status(400).json({ error: 'invalid_payload' })
      return
    }
    if (rating < 1 || rating > 5) {
      res.status(400).json({ error: 'invalid_rating' })
      return
    }

    const exists = db
      .prepare('SELECT 1 FROM users WHERE id = ? AND role = "conveyancer"')
      .get(conveyancerId)
    if (!exists) {
      res.status(404).json({ error: 'missing_conveyancer' })
      return
    }

    const author = reviewerName?.trim() || user.fullName

    db.prepare(
      'INSERT INTO conveyancer_reviews (conveyancer_id, reviewer_name, rating, comment) VALUES (?, ?, ?, ?)' 
    ).run(conveyancerId, author, rating, comment.trim())

    res.status(201).json({ ok: true })
    return
  }

  res.setHeader('Allow', ['GET', 'POST'])
  res.status(405).end('Method Not Allowed')
}

export default handler
