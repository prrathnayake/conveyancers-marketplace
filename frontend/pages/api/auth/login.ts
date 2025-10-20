import type { NextApiResponse } from 'next'
import { withObservability, type ObservedRequest } from '../../../lib/observability'
import {
  login as loginThroughIdentity,
  reportIdentityError,
} from '../../../lib/services/identity'

const handler = async (req: ObservedRequest, res: NextApiResponse): Promise<void> => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    res.status(405).end('Method Not Allowed')
    return
  }

  const { email, password } = req.body as { email?: string; password?: string }
  if (!email || !password) {
    res.status(400).json({ error: 'missing_fields' })
    return
  }

  try {
    const result = await loginThroughIdentity({ email, password })
    res.setHeader('Set-Cookie', result.cookies)
    res.status(200).json({
      ok: true,
      expiresAt: result.expiresAt,
      verificationRequired: result.verificationRequired ?? false,
      verification: result.verification ?? null,
    })
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? (error as { code?: string }).code : undefined
    if (code === 'invalid_credentials') {
      res.status(401).json({ error: 'invalid_credentials' })
      return
    }
    if (code === 'account_inactive') {
      res.status(403).json({ error: 'account_inactive' })
      return
    }

    reportIdentityError('login_failed', error, {
      endpoint: '/api/auth/login',
      email,
    })
    res.status(500).json({ error: 'login_failed' })
  }
}

export default withObservability(handler, { feature: 'auth_login' })
