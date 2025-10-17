import type { NextApiRequest, NextApiResponse } from 'next'

import db, { ensureSchema } from '../../../lib/db'

const PUBLIC_KEYS = new Set(['statusBanner', 'supportEmail', 'serviceFeeRate', 'escrowAccountName'])

const handler = (_req: NextApiRequest, res: NextApiResponse): void => {
  ensureSchema()

  const placeholders = Array.from(PUBLIC_KEYS)
    .map(() => '?')
    .join(', ')
  const rows = db
    .prepare(`SELECT key, value FROM platform_settings WHERE key IN (${placeholders})`)
    .all(...Array.from(PUBLIC_KEYS)) as Array<{ key: string; value: string }>

  const settings: Record<string, string> = {}
  for (const { key, value } of rows) {
    if (PUBLIC_KEYS.has(key)) {
      settings[key] = value
    }
  }
  res.status(200).json({ settings })
}

export default handler
