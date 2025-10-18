import type { NextApiResponse } from 'next'
import { requireRole } from '../../../../frontend/lib/session'
import { recordTrustPayout } from '../../../../frontend/lib/trustAccounts'
import { withObservability, type ObservedRequest } from '../../../../frontend/lib/observability'

const handler = (req: ObservedRequest, res: NextApiResponse): void => {
  const actor = requireRole(req, res, ['admin'])
  if (!actor) {
    return
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    res.status(405).end('Method Not Allowed')
    return
  }

  const { accountId, paymentId, amountCents, processedAt, notes } = req.body as {
    accountId?: number
    paymentId?: string
    amountCents?: number
    processedAt?: string
    notes?: string
  }

  if (!accountId || !paymentId || typeof amountCents !== 'number') {
    res.status(400).json({ error: 'invalid_payload' })
    return
  }

  const isoProcessedAt = processedAt ?? new Date().toISOString()
  recordTrustPayout({
    accountId,
    paymentId,
    amountCents,
    processedAt: isoProcessedAt,
    reviewer: actor.email,
    notes,
    correlationId: req.correlationId,
  })
  res.status(201).json({ ok: true })
}

export default withObservability(handler, { feature: 'admin_trust_payouts' })
