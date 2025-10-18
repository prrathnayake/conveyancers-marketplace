import type { NextApiResponse } from 'next'
import { requireRole } from '../../../frontend/lib/session'
import { createQuote, listQuotesForJob, updateQuoteStatus, recordQuoteNotification } from '../../../frontend/lib/quotes'
import { withObservability, type ObservedRequest } from '../../../frontend/lib/observability'

const handler = (req: ObservedRequest, res: NextApiResponse): void => {
  const actor = requireRole(req, res, ['admin'])
  if (!actor) {
    return
  }

  if (req.method === 'GET') {
    const { jobId } = req.query as { jobId?: string }
    if (!jobId) {
      res.status(400).json({ error: 'missing_job_id' })
      return
    }
    res.status(200).json(listQuotesForJob(jobId))
    return
  }

  if (req.method === 'POST') {
    const { jobId, milestoneId, description, amountCents, currency, expiresAt } = req.body as {
      jobId?: string
      milestoneId?: string
      description?: string
      amountCents?: number
      currency?: string
      expiresAt?: string
    }
    if (!jobId || !milestoneId || !description || typeof amountCents !== 'number' || !currency) {
      res.status(400).json({ error: 'invalid_payload' })
      return
    }
    const quote = createQuote({
      jobId,
      milestoneId,
      description,
      amountCents,
      currency,
      actor: actor.email,
      correlationId: req.correlationId,
      expiresAt,
    })
    res.status(201).json(quote)
    return
  }

  if (req.method === 'PUT') {
    const { id, status, notifyMessage, delivered } = req.body as {
      id?: string
      status?: string
      notifyMessage?: string
      delivered?: boolean
    }
    if (!id || !status) {
      res.status(400).json({ error: 'invalid_payload' })
      return
    }
    try {
      const quote = updateQuoteStatus({
        quoteId: id,
        status,
        actor: actor.email,
        correlationId: req.correlationId,
      })
      if (!quote) {
        res.status(404).json({ error: 'quote_not_found' })
        return
      }
      if (notifyMessage) {
        recordQuoteNotification({
          quoteId: id,
          message: notifyMessage,
          delivered: Boolean(delivered),
          correlationId: req.correlationId,
        })
      }
      res.status(200).json(quote)
      return
    } catch (error) {
      if (error instanceof Error && error.message === 'invalid_status_transition') {
        res.status(409).json({ error: 'invalid_status_transition' })
        return
      }
      throw error
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'PUT'])
  res.status(405).end('Method Not Allowed')
}

export default withObservability(handler, { feature: 'admin_quote_management' })
