import type { NextApiRequest, NextApiResponse } from 'next'

import { verifyLicenceAgainstRegistry } from '../../../lib/conveyancingGov'
import { requireAuth } from '../../../lib/session'
import { recordVerificationEvent } from '../../../lib/services/identity'

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  const user = requireAuth(req, res)
  if (!user) {
    return
  }

  if (user.role !== 'conveyancer') {
    res.status(403).json({ error: 'forbidden' })
    return
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    res.status(405).end('Method Not Allowed')
    return
  }

  const { licenceNumber, state, businessName } = req.body as {
    licenceNumber?: string
    state?: string
    businessName?: string
  }

  if (!licenceNumber || !state) {
    res.status(400).json({ error: 'missing_fields' })
    return
  }

  const result = verifyLicenceAgainstRegistry({
    licenceNumber,
    state,
    businessName,
  })

  const response = await recordVerificationEvent({
    userId: user.id,
    channel: 'conveyancing',
    metadata: {
      approved: result.approved,
      status: result.status,
      reference: result.reference,
      reason: result.reason ?? '',
    },
  })

  res.status(200).json({
    ok: result.approved,
    status: result.status,
    reference: result.reference,
    reason: result.reason ?? null,
    verification: response.verification,
  })
}

export default handler
