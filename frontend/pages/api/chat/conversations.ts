import type { NextApiRequest, NextApiResponse } from 'next'

import db from '../../../lib/db'
import { requireAuth } from '../../../lib/session'
import { ensureParticipant, getOrCreateConversation } from '../../../lib/conversations'
import {
  isConversationPerspective,
  upsertConversationPerspective,
} from '../../../lib/conversationPerspectives'

const isAllowedPairing = (actorRole: string, partnerRole: string): boolean => {
  if (actorRole === 'admin') {
    return true
  }
  if (actorRole === 'conveyancer') {
    return partnerRole === 'buyer' || partnerRole === 'seller'
  }
  if (partnerRole === 'conveyancer') {
    return actorRole === 'buyer' || actorRole === 'seller'
  }
  return false
}

const handler = (req: NextApiRequest, res: NextApiResponse): void => {
  const user = requireAuth(req, res)
  if (!user) {
    return
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    res.status(405).end('Method Not Allowed')
    return
  }

  const { partnerId, perspective } = req.body as { partnerId?: number; perspective?: string }
  if (!partnerId || Number.isNaN(Number(partnerId))) {
    res.status(400).json({ error: 'invalid_partner' })
    return
  }

  const partner = db
    .prepare('SELECT id, role FROM users WHERE id = ?')
    .get(Number(partnerId)) as { id: number; role: string } | undefined

  if (!partner) {
    res.status(404).json({ error: 'partner_not_found' })
    return
  }

  if (!isAllowedPairing(user.role, partner.role)) {
    res.status(403).json({ error: 'forbidden' })
    return
  }

  const conversation = getOrCreateConversation(user.id, partner.id)
  if (!ensureParticipant(conversation.id, user.id)) {
    res.status(403).json({ error: 'forbidden' })
    return
  }

  if (
    perspective &&
    isConversationPerspective(perspective) &&
    (user.role === 'buyer' || user.role === 'seller' || user.role === 'admin')
  ) {
    try {
      upsertConversationPerspective(conversation.id, user.id, perspective)
    } catch (error) {
      console.error('Failed to persist conversation perspective', error)
    }
  }

  res.status(201).json({ conversationId: conversation.id })
}

export default handler
