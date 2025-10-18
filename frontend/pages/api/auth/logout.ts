import type { NextApiResponse } from 'next'
import {
  destroySessionCookie,
  destroyRefreshCookie,
  getRefreshTokenFromRequest,
} from '../../../lib/session'
import { revokeRefreshToken } from '../../../lib/authTokens'
import { withObservability, type ObservedRequest } from '../../../lib/observability'

const handler = (req: ObservedRequest, res: NextApiResponse): void => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    res.status(405).end('Method Not Allowed')
    return
  }
  const token = getRefreshTokenFromRequest(req)
  if (token) {
    revokeRefreshToken(token)
  }
  res.setHeader('Set-Cookie', [destroySessionCookie(), destroyRefreshCookie()])
  res.status(204).end()
}

export default withObservability(handler, { feature: 'auth_logout' })
