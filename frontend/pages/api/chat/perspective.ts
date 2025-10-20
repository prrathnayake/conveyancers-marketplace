import type { NextApiRequest, NextApiResponse } from 'next'

import { ensureParticipant, getOrCreateConversation } from '../../../lib/conversations'
import {
  isConversationPerspective,
  listConversationPerspectives,
  upsertConversationPerspective,
} from '../../../lib/conversationPerspectives'
import { requireAuth } from '../../../lib/session'

const resolvePartnerId = (req: NextApiRequest): number | null => {
  if (req.method === 'GET') {
    const raw = Array.isArray(req.query.partnerId) ? req.query.partnerId[0] : req.query.partnerId
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  }
  if (req.method === 'POST') {
    const { partnerId } = req.body as { partnerId?: number }
    if (!partnerId || Number.isNaN(Number(partnerId))) {
      return null
    }
    return Number(partnerId)
  }
  return null
}

const respondWithPerspectives = (
  res: NextApiResponse,
  conversationId: number,
  viewerId: number,
  partnerId: number,
): void => {
  const records = listConversationPerspectives(conversationId)
  const viewer = records.find((record) => record.userId === viewerId) ?? null
  const partner = records.find((record) => record.userId === partnerId) ?? null
  res.status(200).json({ viewer, partner })
}

const handler = (req: NextApiRequest, res: NextApiResponse): void => {
  const user = requireAuth(req, res)
  if (!user) {
    return
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST'])
    res.status(405).end('Method Not Allowed')
    return
  }

  const partnerId = resolvePartnerId(req)
  if (!partnerId) {
    res.status(400).json({ error: 'invalid_partner' })
    return
  }

  const conversation = getOrCreateConversation(user.id, partnerId)
  if (!ensureParticipant(conversation.id, user.id)) {
    res.status(403).json({ error: 'forbidden' })
    return
  }

  if (req.method === 'GET') {
    respondWithPerspectives(res, conversation.id, user.id, partnerId)
    return
  }

  const { perspective } = req.body as { perspective?: string }
  if (!perspective || !isConversationPerspective(perspective)) {
    res.status(400).json({ error: 'invalid_perspective' })
    return
  }

  if (user.role !== 'buyer' && user.role !== 'seller' && user.role !== 'admin') {
    res.status(403).json({ error: 'unsupported_role' })
    return
  }

  upsertConversationPerspective(conversation.id, user.id, perspective)
  respondWithPerspectives(res, conversation.id, user.id, partnerId)
}

export default handler
