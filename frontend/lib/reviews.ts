import db from './db'

export type StoredReview = {
  id: number
  reviewerName: string
  rating: number
  comment: string
  createdAt: string
}

const mapRow = (row: any): StoredReview => ({
  id: row.id as number,
  reviewerName: row.reviewer_name as string,
  rating: row.rating as number,
  comment: row.comment as string,
  createdAt: row.created_at as string,
})

const normalizeLimit = (value?: number): number | undefined => {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
    return undefined
  }
  return Math.min(Math.floor(value), 200)
}

export const listConveyancerReviews = (
  conveyancerId: number,
  options: { limit?: number } = {},
): StoredReview[] => {
  const limit = normalizeLimit(options.limit)
  const baseQuery =
    `SELECT id, reviewer_name, rating, comment, created_at
       FROM conveyancer_reviews
      WHERE conveyancer_id = ?
   ORDER BY datetime(created_at) DESC`
  const stmt = limit
    ? db.prepare(`${baseQuery} LIMIT ?`).all(conveyancerId, limit)
    : db.prepare(baseQuery).all(conveyancerId)
  return (stmt as any[]).map(mapRow)
}

export const listProductReviews = (options: { limit?: number } = {}): StoredReview[] => {
  const limit = normalizeLimit(options.limit)
  const baseQuery =
    `SELECT id, reviewer_name, rating, comment, created_at
       FROM product_reviews
   ORDER BY datetime(created_at) DESC`
  const stmt = limit ? db.prepare(`${baseQuery} LIMIT ?`).all(limit) : db.prepare(baseQuery).all()
  return (stmt as any[]).map(mapRow)
}

export const getProductReviewStats = (): { average: number; count: number } => {
  const row = db
    .prepare('SELECT AVG(rating) AS average_rating, COUNT(1) AS total FROM product_reviews')
    .get() as { average_rating?: number; total?: number }
  return {
    average: Number(row?.average_rating ?? 0),
    count: Number(row?.total ?? 0),
  }
}

export const recordProductReview = (
  reviewerId: number | null,
  reviewerName: string,
  rating: number,
  comment: string,
): void => {
  db.prepare(
    `INSERT INTO product_reviews (reviewer_id, reviewer_name, rating, comment)
     VALUES (?, ?, ?, ?)`
  ).run(reviewerId, reviewerName, rating, comment)
}

const reviewableJobStatuses = ["completed", "canceled"] as const

type ReviewableJobStatus = (typeof reviewableJobStatuses)[number]

type JobRecord = {
  reference: string
  status: ReviewableJobStatus
}

export const findLatestReviewableJob = (
  customerId: number,
  conveyancerId: number,
): JobRecord | null => {
  const row = db
    .prepare(
      `SELECT reference, status
         FROM customer_jobs
        WHERE customer_id = ? AND conveyancer_id = ?
          AND status IN ('completed','canceled')
     ORDER BY datetime(COALESCE(completed_at, updated_at)) DESC
        LIMIT 1`,
    )
    .get(customerId, conveyancerId) as JobRecord | undefined
  return row ?? null
}

export const hasReviewForJob = (
  conveyancerId: number,
  jobReference: string,
): boolean => {
  if (!jobReference) {
    return false
  }
  const row = db
    .prepare(
      `SELECT 1
         FROM conveyancer_reviews
        WHERE conveyancer_id = ? AND job_reference = ?
        LIMIT 1`,
    )
    .get(conveyancerId, jobReference) as { 1?: number } | undefined
  return Boolean(row)
}

export const recordConveyancerReview = (
  conveyancerId: number,
  reviewerName: string,
  rating: number,
  comment: string,
  jobReference: string,
): void => {
  db.prepare(
    `INSERT INTO conveyancer_reviews (conveyancer_id, reviewer_name, rating, comment, job_reference)
     VALUES (?, ?, ?, ?, ?)`
  ).run(conveyancerId, reviewerName, rating, comment, jobReference)
}
