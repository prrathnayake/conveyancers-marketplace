import type { NextApiRequest, NextApiResponse } from 'next'
import db from '../../../lib/db'
import { requireAuth } from '../../../lib/session'
import { encryptText, decryptText } from '../../../lib/secure'
import { ensureParticipant, getOrCreateConversation } from '../../../lib/conversations'

const listMessages = (conversationId: number) => {
  const stmt = db.prepare(
    'SELECT id, sender_id, iv, auth_tag, ciphertext, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
  )
  return stmt.all(conversationId) as Array<{
    id: number
    sender_id: number
    iv: string
    auth_tag: string
    ciphertext: string
    created_at: string
  }>
}

const handler = (req: NextApiRequest, res: NextApiResponse): void => {
  const user = requireAuth(req, res)
  if (!user) {
    return
  }

  if (req.method === 'GET') {
    const partnerId = Number(req.query.partnerId)
    if (!partnerId || Number.isNaN(partnerId)) {
      res.status(400).json({ error: 'invalid_partner' })
      return
    }
    const partnerExists = db.prepare('SELECT 1 FROM users WHERE id = ?').get(partnerId)
    if (!partnerExists) {
      res.status(404).json({ error: 'partner_not_found' })
      return
    }
    const conversation = getOrCreateConversation(user.id, partnerId)
    if (!ensureParticipant(conversation.id, user.id)) {
      res.status(403).json({ error: 'forbidden' })
      return
    }
      const messages = listMessages(conversation.id).map((message) => ({
        id: message.id,
        senderId: message.sender_id,
        createdAt: message.created_at,
        body: decryptText({ iv: message.iv, authTag: message.auth_tag, ciphertext: message.ciphertext }),
        attachments: (db
          .prepare(
            'SELECT id, filename, mime_type FROM message_files WHERE message_id = ? ORDER BY created_at ASC'
          )
          .all(message.id) as Array<{ id: number; filename: string; mime_type: string }>
        ).map((file) => ({
          id: file.id,
          filename: file.filename,
          mimeType: file.mime_type,
        })),
      }))
    res.status(200).json({ conversationId: conversation.id, messages })
    return
  }

  if (req.method === 'POST') {
    const { partnerId, body } = req.body as { partnerId?: number; body?: string }
    if (!partnerId || Number.isNaN(Number(partnerId))) {
      res.status(400).json({ error: 'invalid_partner' })
      return
    }
    if (!body || !body.trim()) {
      res.status(400).json({ error: 'empty_message' })
      return
    }

    const partnerExists = db.prepare('SELECT 1 FROM users WHERE id = ?').get(Number(partnerId))
    if (!partnerExists) {
      res.status(404).json({ error: 'partner_not_found' })
      return
    }
    const conversation = getOrCreateConversation(user.id, Number(partnerId))
    if (!ensureParticipant(conversation.id, user.id)) {
      res.status(403).json({ error: 'forbidden' })
      return
    }

    const encrypted = encryptText(body.trim())
    const insert = db.prepare(
      'INSERT INTO messages (conversation_id, sender_id, iv, auth_tag, ciphertext) VALUES (?, ?, ?, ?, ?)'
    )
    const info = insert.run(conversation.id, user.id, encrypted.iv, encrypted.authTag, encrypted.ciphertext)
    res.status(201).json({ messageId: Number(info.lastInsertRowid) })
    return
  }

  res.setHeader('Allow', ['GET', 'POST'])
  res.status(405).end('Method Not Allowed')
}

export default handler
