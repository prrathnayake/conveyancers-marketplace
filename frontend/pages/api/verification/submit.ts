import type { NextApiRequest, NextApiResponse } from 'next'

import { verifyCode } from '../../../lib/otp'
import { recomputeVerificationStatus } from '../../../lib/verification'
import { requireAuth } from '../../../lib/session'

const handler = (req: NextApiRequest, res: NextApiResponse): void => {
  const user = requireAuth(req, res)
  if (!user) {
    return
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    res.status(405).end('Method Not Allowed')
    return
  }

  const { channel, code } = req.body as { channel?: 'email' | 'phone'; code?: string }
  if (channel !== 'email' && channel !== 'phone') {
    res.status(400).json({ error: 'invalid_channel' })
    return
  }
  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: 'missing_code' })
    return
  }

  const normalized = code.trim()
  if (!/^[0-9]{6}$/.test(normalized)) {
    res.status(400).json({ error: 'invalid_code' })
    return
  }

  const result = verifyCode(user.id, channel, normalized)
  if (!result.ok) {
    res.status(400).json({ error: result.reason })
    return
  }

  const verification = recomputeVerificationStatus(user.id)
  res.status(200).json({ ok: true, verifiedAt: result.verifiedAt, verification })
}

export default handler
