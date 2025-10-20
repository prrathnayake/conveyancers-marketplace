import type { NextApiRequest, NextApiResponse } from 'next'

import { requireAuth } from '../../../lib/session'
import { requestVerification } from '../../../lib/services/identity'

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

  const { channel, phone } = req.body as { channel?: 'email' | 'phone'; phone?: string }
  if (channel !== 'email' && channel !== 'phone') {
    res.status(400).json({ error: 'invalid_channel' })
    return
  }

  try {
    const response = await requestVerification({
      user,
      channel,
      phoneOverride: phone,
    })

    const payload: Record<string, unknown> = {
      ok: true,
      expiresAt: response.expiresAt,
      verification: response.verification,
    }
    if (response.debugCode) {
      payload.debugCode = response.debugCode
    }

    res.status(200).json(payload)
  } catch (error) {
    if (error instanceof Error && error.message === 'rate_limited') {
      res.status(429).json({ error: 'rate_limited' })
      return
    }
    const code = typeof error === 'object' && error && 'code' in error ? (error as { code?: string }).code : undefined
    if (code === 'invalid_phone') {
      res.status(400).json({ error: 'invalid_phone' })
      return
    }
    res.status(500).json({ error: 'verification_issue_failed' })
  }
}

export default handler
