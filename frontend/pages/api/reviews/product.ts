import type { NextApiRequest, NextApiResponse } from 'next'

import { requireAuth } from '../../../lib/session'
import {
  getProductReviewStats,
  listProductReviews,
  recordProductReview,
} from '../../../lib/reviews'

const handler = (req: NextApiRequest, res: NextApiResponse): void => {
  if (req.method === 'GET') {
    const limitParam = req.query.limit
    const limit = typeof limitParam === 'string' ? Number(limitParam) : undefined
    const reviews = listProductReviews({ limit })
    const stats = getProductReviewStats()
    res.status(200).json({ reviews, stats })
    return
  }

  if (req.method === 'POST') {
    const user = requireAuth(req, res)
    if (!user) {
      return
    }

    const { rating, comment, reviewerName } = req.body as {
      rating?: number
      comment?: string
      reviewerName?: string
    }

    if (!rating || rating < 1 || rating > 5 || !comment?.trim()) {
      res.status(400).json({ error: 'invalid_payload' })
      return
    }

    const displayName = reviewerName?.trim() || user.fullName
    recordProductReview(user.id, displayName, rating, comment.trim())
    const stats = getProductReviewStats()
    res.status(201).json({ ok: true, stats })
    return
  }

  res.setHeader('Allow', ['GET', 'POST'])
  res.status(405).end('Method Not Allowed')
}

export default handler
