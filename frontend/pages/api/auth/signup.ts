import type { NextApiRequest, NextApiResponse } from 'next'
import {
  signup as registerThroughIdentity,
  reportIdentityError,
} from '../../../lib/services/identity'

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
    const { email, password, role, fullName, phone } = req.body as SignupRequest

    if (!email || !password || !role || !fullName || !phone) {
      res.status(400).json({ error: 'missing_fields' })
      return
    }

    if (!allowedRoles.has(role.trim().toLowerCase())) {
      res.status(400).json({ error: 'invalid_role' })
      return
    }

    const result = await registerThroughIdentity({
      email,
      password,
      role,
      fullName,
      phone,
    })

    res.setHeader('Set-Cookie', result.cookies)

    const payload: Record<string, unknown> = {
      ok: true,
      verification: result.verification,
    }
    if (result.debugCodes) {
      payload.debugCodes = result.debugCodes
    }

    res.status(201).json(payload)
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? (error as { code?: string }).code : undefined
    if (code === 'email_in_use') {
      res.status(409).json({ error: 'email_in_use' })
      return
    }
    if (code === 'invalid_phone') {
      res.status(400).json({ error: 'invalid_phone' })
      return
    }
    if (code === 'weak_password') {
      res.status(400).json({ error: 'weak_password' })
      return
    }
    if (code === 'invalid_role') {
      res.status(400).json({ error: 'invalid_role' })
      return
    }

    reportIdentityError('Signup handler failed', error, {
      endpoint: '/api/auth/signup',
      email: (req.body as SignupRequest)?.email ?? null,
    })
    res.status(500).json({ error: 'signup_failed' })
  }
}

export default handler
