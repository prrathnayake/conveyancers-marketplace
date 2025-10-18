import type { NextApiRequest, NextApiResponse } from 'next'

import db from '../../../lib/db'
import { requireRole } from '../../../lib/session'
import {
  findLatestReviewableJob,
  hasReviewForJob,
  listConveyancerReviews,
  recordConveyancerReview,
} from '../../../lib/reviews'

const handler = (req: NextApiRequest, res: NextApiResponse): void => {
  if (req.method === 'GET') {
    const { conveyancerId } = req.query
    const numericId = typeof conveyancerId === 'string' ? Number(conveyancerId) : NaN
    if (!numericId) {
      res.status(400).json({ error: 'invalid_conveyancer' })
      return
    }
    const limitParam = req.query.limit
    const limit = typeof limitParam === 'string' ? Number(limitParam) : undefined
    const reviews = listConveyancerReviews(numericId, { limit })
    res.status(200).json({ reviews })
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
    if (!conveyancerId || !rating || !comment?.trim()) {
      res.status(400).json({ error: 'invalid_payload' })
      return
    }
    if (rating < 1 || rating > 5) {
      res.status(400).json({ error: 'invalid_rating' })
      return
    }

    const exists = db
      .prepare("SELECT 1 FROM users WHERE id = ? AND role = 'conveyancer'")
      .get(conveyancerId)
    if (!exists) {
      res.status(404).json({ error: 'missing_conveyancer' })
      return
    }

    const author = reviewerName?.trim() || user.fullName
    const job = findLatestReviewableJob(user.id, conveyancerId)
    if (!job) {
      res.status(403).json({ error: 'job_not_reviewable' })
      return
    }

    if (hasReviewForJob(conveyancerId, job.reference)) {
      res.status(409).json({ error: 'review_exists_for_job' })
      return
    }

    recordConveyancerReview(conveyancerId, author, rating, comment.trim(), job.reference)

    res.status(201).json({ ok: true })
    return
  }

  res.setHeader('Allow', ['GET', 'POST'])
  res.status(405).end('Method Not Allowed')
}

export default handler
