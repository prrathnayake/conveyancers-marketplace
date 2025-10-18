import type { NextApiRequest, NextApiResponse } from 'next'

import { getVerificationSummary } from '../../../lib/verification'
import { requireAuth } from '../../../lib/session'

const handler = (req: NextApiRequest, res: NextApiResponse): void => {
  const user = requireAuth(req, res)
  if (!user) {
    return
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    res.status(405).end('Method Not Allowed')
    return
  }

  const summary = getVerificationSummary(user.id)
  res.status(200).json({ verification: summary })
}

export default handler
