import type { NextApiRequest, NextApiResponse } from 'next'

import { requireAuth } from '../../../lib/session'
import { recordVerificationEvent } from '../../../lib/services/identity'

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
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

  try {
    const result = await recordVerificationEvent({
      userId: user.id,
      channel,
      code: normalized,
    })
    res.status(200).json({ ok: true, verification: result.verification })
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? (error as { code?: string }).code : undefined
    if (code === 'missing_code' || code === 'invalid_code') {
      res.status(400).json({ error: 'invalid_code' })
      return
    }
    res.status(400).json({ error: code ?? 'verification_failed' })
  }
}

export default handler
