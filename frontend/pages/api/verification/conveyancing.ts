import type { NextApiRequest, NextApiResponse } from 'next'

import db from '../../../lib/db'
import { verifyLicenceAgainstRegistry } from '../../../lib/conveyancingGov'
import { recomputeVerificationStatus } from '../../../lib/verification'
import { requireAuth } from '../../../lib/session'

const handler = (req: NextApiRequest, res: NextApiResponse): void => {
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

  const timestamp = result.approved ? new Date().toISOString() : null

  db.prepare(
    `UPDATE conveyancer_profiles
        SET gov_status = ?,
            gov_check_reference = ?,
            gov_verified_at = ?,
            gov_denial_reason = ?
      WHERE user_id = ?`
  ).run(
    result.status,
    result.reference,
    timestamp,
    result.approved ? '' : result.reason ?? '',
    user.id
  )

  const verification = recomputeVerificationStatus(user.id)

  res.status(200).json({
    ok: result.approved,
    status: result.status,
    reference: result.reference,
    reason: result.reason ?? null,
    verification,
  })
}

export default handler
