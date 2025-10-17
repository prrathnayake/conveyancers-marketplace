import type { NextApiRequest, NextApiResponse } from 'next'

import db from '../../../frontend/lib/db'
import { requireRole } from '../../../frontend/lib/session'

const allowedKeys = new Set(['supportEmail', 'statusBanner', 'serviceFeeRate', 'escrowAccountName'])

const handler = (req: NextApiRequest, res: NextApiResponse): void => {
  const user = requireRole(req, res, ['admin'])
  if (!user) {
    return
  }

  if (req.method === 'GET') {
    const rows = db.prepare('SELECT key, value FROM platform_settings').all() as Array<{
      key: string
      value: string
    }>
    const payload: Record<string, string> = {}
    for (const row of rows) {
      payload[row.key] = row.value
    }
    res.status(200).json({ settings: payload })
    return
  }

  if (req.method === 'PUT') {
    const { settings } = req.body as { settings?: Record<string, string> }
    if (!settings) {
      res.status(400).json({ error: 'missing_settings' })
      return
    }
    const tx = db.transaction(() => {
      for (const [key, value] of Object.entries(settings)) {
        if (!allowedKeys.has(key)) {
          continue
        }
        db.prepare(
          'INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at'
        ).run(key, value)
      }
    })
    tx()
    res.status(200).json({ ok: true })
    return
  }

  res.setHeader('Allow', ['GET', 'PUT'])
  res.status(405).end('Method Not Allowed')
}

export default handler
