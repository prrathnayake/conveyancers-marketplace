import type { NextApiRequest, NextApiResponse } from 'next'

import db from '../../../lib/db'

const PUBLIC_KEYS = new Set(['statusBanner', 'supportEmail'])

const handler = (_req: NextApiRequest, res: NextApiResponse): void => {
  const rows = db
    .prepare('SELECT key, value FROM platform_settings WHERE key IN ("statusBanner", "supportEmail")')
    .all() as Array<{ key: string; value: string }>

  const settings: Record<string, string> = {}
  for (const { key, value } of rows) {
    if (PUBLIC_KEYS.has(key)) {
      settings[key] = value
    }
  }
  res.status(200).json({ settings })
}

export default handler
