import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionFromRequest } from '../../lib/session'

const handler = (req: NextApiRequest, res: NextApiResponse): void => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    res.status(405).end('Method Not Allowed')
    return
  }
  const user = getSessionFromRequest(req)
  if (!user) {
    res.status(200).json({ authenticated: false })
    return
  }
  res.status(200).json({ authenticated: true, user })
}

export default handler
