import type { NextApiResponse } from 'next'
import {
  createSessionCookie,
  createRefreshCookie,
  destroySessionCookie,
  destroyRefreshCookie,
  getRefreshTokenFromRequest,
  getUserById,
  type SessionUser,
} from '../../../lib/session'
import { rotateRefreshToken } from '../../../lib/authTokens'
import { withObservability, type ObservedRequest } from '../../../lib/observability'

const handler = (req: ObservedRequest, res: NextApiResponse): void => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    res.status(405).end('Method Not Allowed')
    return
  }

  const fromBody = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : null
  const refreshToken = fromBody ?? getRefreshTokenFromRequest(req)
  if (!refreshToken) {
    res.setHeader('Set-Cookie', [destroySessionCookie(), destroyRefreshCookie()])
    res.status(401).json({ error: 'missing_refresh_token' })
    return
  }

  const rotated = rotateRefreshToken(refreshToken)
  if (!rotated) {
    res.setHeader('Set-Cookie', [destroySessionCookie(), destroyRefreshCookie()])
    res.status(401).json({ error: 'invalid_refresh_token' })
    return
  }

  const user = getUserById(rotated.userId)
  if (!user) {
    res.setHeader('Set-Cookie', [destroySessionCookie(), destroyRefreshCookie()])
    res.status(401).json({ error: 'user_not_found' })
    return
  }

  const sessionCookie = createSessionCookie({
    sub: user.id,
    role: user.role as SessionUser['role'],
  })
  const refreshCookie = createRefreshCookie(rotated.token, rotated.expiresAt)
  res.setHeader('Set-Cookie', [sessionCookie, refreshCookie])
  res.status(200).json({ ok: true, expiresAt: rotated.expiresAt })
}

export default withObservability(handler, { feature: 'auth_refresh_token' })
