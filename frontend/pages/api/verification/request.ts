import type { NextApiRequest, NextApiResponse } from 'next'

import db from '../../../lib/db'
import { issueVerificationCode } from '../../../lib/otp'
import { normalizePhoneNumber } from '../../../lib/phone'
import { recomputeVerificationStatus } from '../../../lib/verification'
import { requireAuth } from '../../../lib/session'
import { sendEmail, sendSms } from '../../../lib/notifications'

const formatExpiryMinutes = (expiresAtIso: string): number => {
  const expires = new Date(expiresAtIso)
  if (Number.isNaN(expires.getTime())) {
    return 10
  }
  return Math.max(1, Math.round((expires.getTime() - Date.now()) / (60 * 1000)))
}

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
    if (channel === 'phone' && typeof phone === 'string' && phone.trim().length > 0) {
      const normalized = normalizePhoneNumber(phone)
      if (!normalized) {
        res.status(400).json({ error: 'invalid_phone' })
        return
      }
      db.prepare('UPDATE users SET phone = ?, phone_verified_at = NULL WHERE id = ?').run(normalized, user.id)
      user.phone = normalized
    }

    const metadata: Record<string, unknown> =
      channel === 'email'
        ? { email: user.email }
        : user.phone
        ? { phone: user.phone }
        : {}
    const issuance = issueVerificationCode(user.id, channel, { metadata })
    const expiryMinutes = formatExpiryMinutes(issuance.expiresAt)
    if (channel === 'email') {
      await sendEmail({
        to: user.email,
        subject: 'Verify your Conveyancers Marketplace account',
        html: `
          <p>Hi ${user.fullName},</p>
          <p>Your verification code is <strong>${issuance.code}</strong>. Enter this code within the next ${expiryMinutes} minutes to confirm your email address.</p>
          <p>If you did not request this, you can ignore this email.</p>
        `,
      })
    } else if (user.phone) {
      await sendSms({
        to: user.phone,
        body: `Conveyancers Marketplace code: ${issuance.code}. It expires in ${expiryMinutes} minutes.`,
      })
    }
    const verification = recomputeVerificationStatus(user.id)

    const payload: Record<string, unknown> = {
      ok: true,
      expiresAt: issuance.expiresAt,
      verification,
    }
    if (process.env.NODE_ENV !== 'production') {
      payload.debugCode = issuance.developmentCode
    }

    res.status(200).json(payload)
  } catch (error) {
    if (error instanceof Error && error.message === 'rate_limited') {
      res.status(429).json({ error: 'rate_limited' })
      return
    }
    res.status(500).json({ error: 'verification_issue_failed' })
  }
}

export default handler
