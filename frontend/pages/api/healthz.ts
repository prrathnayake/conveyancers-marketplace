import type { NextApiRequest, NextApiResponse } from 'next'

const handler = (_req: NextApiRequest, res: NextApiResponse): void => {
  res.status(200).json({ ok: true, timestamp: new Date().toISOString() })
}

export default handler
