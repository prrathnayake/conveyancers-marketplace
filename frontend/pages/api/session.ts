import type { NextApiRequest, NextApiResponse } from 'next'
import { fetchSession } from '../../lib/services/identity'

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    res.status(405).end('Method Not Allowed')
    return
  }
  const session = await fetchSession({ headers: req.headers })
  res.status(200).json(session)
}

export default handler
