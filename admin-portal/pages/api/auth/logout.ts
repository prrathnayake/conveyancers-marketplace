import type { NextApiRequest, NextApiResponse } from 'next'

import { destroySessionCookie } from '../../../../frontend/lib/session'

const handler = (req: NextApiRequest, res: NextApiResponse): void => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    res.status(405).end('Method Not Allowed')
    return
  }
  res.setHeader('Set-Cookie', destroySessionCookie())
  res.status(200).json({ ok: true })
}

export default handler
