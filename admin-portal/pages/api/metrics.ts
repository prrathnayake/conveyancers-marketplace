import type { NextApiRequest, NextApiResponse } from 'next'

import { requireRole } from '../../../frontend/lib/session'
import { loadMetrics, type MetricsPayload } from '../../lib/admin-metrics'

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse<MetricsPayload | { error: string; detail?: string }>,
): Promise<void> => {
  const user = requireRole(req, res, ['admin'])
  if (!user) {
    return
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const result = await loadMetrics()
  if (result.metrics) {
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(result.metrics)
    return
  }

  const { error } = result
  if (!error) {
    res.status(500).json({ error: 'metrics_unavailable' })
    return
  }

  const statusMap: Record<typeof error.code, number> = {
    payments_unavailable: 502,
    metrics_timeout: 504,
    database_unavailable: 503,
  }

  res.status(statusMap[error.code] ?? 500).json({ error: error.code, detail: error.detail })
}

export default handler
