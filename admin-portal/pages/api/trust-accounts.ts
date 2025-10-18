import type { NextApiResponse } from 'next'
import { requireRole } from '../../../frontend/lib/session'
import { listTrustAccounts, registerTrustAccount, reconcileTrustAccount } from '../../../frontend/lib/trustAccounts'
import { withObservability, type ObservedRequest } from '../../../frontend/lib/observability'

const handler = (req: ObservedRequest, res: NextApiResponse): void => {
  const actor = requireRole(req, res, ['admin'])
  if (!actor) {
    return
  }

  if (req.method === 'GET') {
    res.status(200).json(listTrustAccounts())
    return
  }

  if (req.method === 'POST') {
    const { conveyancerId, accountName, accountNumber, bsb } = req.body as {
      conveyancerId?: number
      accountName?: string
      accountNumber?: string
      bsb?: string
    }
    if (!conveyancerId || !accountName || !accountNumber || !bsb) {
      res.status(400).json({ error: 'invalid_payload' })
      return
    }
    try {
      const record = registerTrustAccount({
        conveyancerId,
        accountName,
        accountNumber,
        bsb,
        reviewer: actor.email,
        correlationId: req.correlationId,
      })
      res.status(201).json(record)
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'registration_failed' })
    }
    return
  }

  if (req.method === 'PUT') {
    const { accountId, status } = req.body as {
      accountId?: number
      status?: 'active' | 'suspended' | 'requires_attention'
    }
    if (!accountId || !status) {
      res.status(400).json({ error: 'invalid_payload' })
      return
    }
    reconcileTrustAccount({
      accountId,
      status,
      correlationId: req.correlationId,
      reviewer: actor.email,
    })
    res.status(204).end()
    return
  }

  res.setHeader('Allow', ['GET', 'POST', 'PUT'])
  res.status(405).end('Method Not Allowed')
}

export default withObservability(handler, { feature: 'admin_trust_accounts' })
