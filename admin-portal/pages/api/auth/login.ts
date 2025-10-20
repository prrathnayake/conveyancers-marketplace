import type { NextApiRequest, NextApiResponse } from 'next'
import {
  adminLogin as adminIdentityLogin,
  reportIdentityError,
} from '../../../../frontend/lib/services/identity'

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
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
    const result = await adminIdentityLogin({ email, password })
    res.setHeader('Set-Cookie', result.cookies)
    res.status(200).json({ ok: true })
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

    reportIdentityError('admin_login_failed', error, {
      endpoint: '/admin/api/auth/login',
      email,
    })
    res.status(500).json({ error: 'login_failed' })
  }
}

export default handler
