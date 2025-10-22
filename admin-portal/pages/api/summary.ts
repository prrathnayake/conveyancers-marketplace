import type { NextApiRequest, NextApiResponse } from 'next'

import { requireRole } from '../../../frontend/lib/session'
import { loadAdminSummary, type SummaryPayload } from '../../lib/admin-summary'
const handler = (req: NextApiRequest, res: NextApiResponse<SummaryPayload | { error: string }>): void => {
  const user = requireRole(req, res, ['admin'])
  if (!user) {
    return
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const summary = loadAdminSummary()
  res.status(200).json(summary)
}

export default handler
