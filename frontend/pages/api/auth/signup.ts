import type { NextApiRequest, NextApiResponse } from 'next'
import bcrypt from 'bcryptjs'
import db from '../../../lib/db'
import { createSessionCookie } from '../../../lib/session'
import { ensureAdminSeeded } from '../../../lib/adminSeed'
import { logServerError, serializeError } from '../../../lib/serverLogger'
import { issueVerificationCode } from '../../../lib/otp'
import { recomputeVerificationStatus } from '../../../lib/verification'
import { normalizePhoneNumber } from '../../../lib/phone'
import { sendEmail, sendSms } from '../../../lib/notifications'

const allowedRoles = new Set(['buyer', 'seller', 'conveyancer'])

type SignupRequest = {
  email?: string
  password?: string
  role?: string
  fullName?: string
  phone?: string
}

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    res.status(405).end('Method Not Allowed')
    return
  }

  try {
    ensureAdminSeeded()

    const { email, password, role, fullName, phone } = req.body as SignupRequest

    if (!email || !password || !role || !fullName || !phone) {
      res.status(400).json({ error: 'missing_fields' })
      return
    }
    const trimmedEmail = email.trim().toLowerCase()
    const trimmedRole = role.trim().toLowerCase()
    if (!allowedRoles.has(trimmedRole)) {
      res.status(400).json({ error: 'invalid_role' })
      return
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'weak_password' })
      return
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(trimmedEmail)
    if (existing) {
      res.status(409).json({ error: 'email_in_use' })
      return
    }

    const normalizedPhone = normalizePhoneNumber(phone)
    if (!normalizedPhone) {
      res.status(400).json({ error: 'invalid_phone' })
      return
    }

    const passwordHash = bcrypt.hashSync(password, 12)
    const insert = db.prepare(
      'INSERT INTO users (email, password_hash, role, full_name, phone) VALUES (?, ?, ?, ?, ?)'
    )
    const info = insert.run(trimmedEmail, passwordHash, trimmedRole, fullName.trim(), normalizedPhone)
    const userId = Number(info.lastInsertRowid)

    if (trimmedRole === 'conveyancer') {
      db.prepare(
        'INSERT INTO conveyancer_profiles (user_id, firm_name, bio, phone, state, website) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(userId, '', '', '', '', '')
    }

    console.info('User registered successfully', { email: trimmedEmail, role: trimmedRole })

    const cookie = createSessionCookie({
      sub: userId,
      role: trimmedRole as 'buyer' | 'seller' | 'conveyancer',
    })
    res.setHeader('Set-Cookie', cookie)

    const emailCode = issueVerificationCode(userId, 'email', { metadata: { email: trimmedEmail } })
    const phoneCode = issueVerificationCode(userId, 'phone', { metadata: { phone: normalizedPhone } })

    await Promise.allSettled([
      sendEmail({
        to: trimmedEmail,
        subject: 'Verify your Conveyancers Marketplace account',
        html: `
          <p>Hi ${fullName.trim()},</p>
          <p>Welcome to Conveyancers Marketplace. Use the verification code <strong>${emailCode.code}</strong> within the next 10 minutes to confirm your email address.</p>
          <p>If you didn't create this account, you can ignore this message.</p>
        `,
      }),
      sendSms({
        to: normalizedPhone,
        body: `Welcome to Conveyancers Marketplace. Your verification code is ${phoneCode.code}. It expires in 10 minutes.`,
      }),
    ])
    const verification = recomputeVerificationStatus(userId)

    const payload: Record<string, unknown> = {
      ok: true,
      verification,
    }
    if (process.env.NODE_ENV !== 'production') {
      payload.debugCodes = {
        email: emailCode.developmentCode,
        phone: phoneCode.developmentCode,
      }
    }

    res.status(201).json(payload)
  } catch (error) {
    logServerError('Signup handler failed', {
      error: serializeError(error),
      endpoint: '/api/auth/signup',
      email: (req.body as SignupRequest)?.email ?? null,
    })
    res.status(500).json({ error: 'signup_failed' })
  }
}

export default handler
