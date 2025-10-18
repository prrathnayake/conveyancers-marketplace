import crypto from 'crypto'
import db from './db'
import { logTrace } from './observability'

export type QuoteRecord = {
  id: string
  jobId: string
  milestoneId: string
  description: string
  amountCents: number
  currency: string
  status: string
  issuedAt: string
  expiresAt: string | null
  lastNotifiedAt: string | null
}

const generateId = (): string => `quote_${crypto.randomUUID()}`

const normalizeCurrency = (value: string): string => value.trim().toUpperCase()

const transitionAllowed = (current: string, next: string): boolean => {
  const transitions: Record<string, string[]> = {
    draft: ['sent', 'cancelled'],
    sent: ['accepted', 'declined', 'expired', 'cancelled'],
    accepted: ['completed'],
    declined: [],
    expired: [],
    cancelled: [],
    completed: [],
  }
  return transitions[current]?.includes(next) ?? false
}

const expireOverdue = (): void => {
  const nowIso = new Date().toISOString()
  db.prepare(
    `UPDATE milestone_quotes SET status = 'expired'
       WHERE expires_at IS NOT NULL AND expires_at < ? AND status = 'sent'`
  ).run(nowIso)
}

export const listQuotesForJob = (jobId: string): QuoteRecord[] => {
  expireOverdue()
  return db
    .prepare(
      `SELECT id, job_id AS jobId, milestone_id AS milestoneId, description, amount_cents AS amountCents,
              currency, status, issued_at AS issuedAt, expires_at AS expiresAt, last_notified_at AS lastNotifiedAt
         FROM milestone_quotes WHERE job_id = ? ORDER BY issued_at DESC`
    )
    .all(jobId) as QuoteRecord[]
}

export const createQuote = (input: {
  jobId: string
  milestoneId: string
  description: string
  amountCents: number
  currency: string
  actor: string
  correlationId: string
  expiresAt?: string
}): QuoteRecord => {
  const id = generateId()
  const issuedAt = new Date().toISOString()
  const expiresAt = input.expiresAt ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  db.prepare(
    `INSERT INTO milestone_quotes (id, job_id, milestone_id, description, amount_cents, currency, status, issued_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, 'sent', ?, ?)`
  ).run(
    id,
    input.jobId,
    input.milestoneId,
    input.description,
    input.amountCents,
    normalizeCurrency(input.currency),
    issuedAt,
    expiresAt
  )
  logTrace(input.correlationId, 'quote_created', {
    quoteId: id,
    jobId: input.jobId,
    milestoneId: input.milestoneId,
    amountCents: input.amountCents,
  })
  return getQuote(id) as QuoteRecord
}

export const getQuote = (quoteId: string): QuoteRecord | null => {
  const row = db
    .prepare(
      `SELECT id, job_id AS jobId, milestone_id AS milestoneId, description, amount_cents AS amountCents,
              currency, status, issued_at AS issuedAt, expires_at AS expiresAt, last_notified_at AS lastNotifiedAt
         FROM milestone_quotes WHERE id = ?`
    )
    .get(quoteId) as QuoteRecord | undefined
  return row ?? null
}

export const updateQuoteStatus = (
  input: { quoteId: string; status: string; actor: string; correlationId: string }
): QuoteRecord | null => {
  const current = getQuote(input.quoteId)
  if (!current) {
    return null
  }
  const next = input.status.trim().toLowerCase()
  if (!transitionAllowed(current.status, next)) {
    throw new Error('invalid_status_transition')
  }
  db.prepare('UPDATE milestone_quotes SET status = ?, last_notified_at = CURRENT_TIMESTAMP WHERE id = ?').run(
    next,
    input.quoteId
  )
  logTrace(input.correlationId, 'quote_status_changed', {
    quoteId: input.quoteId,
    from: current.status,
    to: next,
    actor: input.actor,
  })
  return getQuote(input.quoteId)
}

export const recordQuoteNotification = (
  input: { quoteId: string; message: string; delivered: boolean; correlationId: string }
): void => {
  db.prepare(
    `INSERT INTO quote_notifications (id, quote_id, message, delivered)
     VALUES (?, ?, ?, ?)`
  ).run(`quote_notice_${crypto.randomUUID()}`, input.quoteId, input.message, input.delivered ? 1 : 0)
  db.prepare('UPDATE milestone_quotes SET last_notified_at = CURRENT_TIMESTAMP WHERE id = ?').run(input.quoteId)
  logTrace(input.correlationId, 'quote_notification', {
    quoteId: input.quoteId,
    delivered: input.delivered,
  })
}
