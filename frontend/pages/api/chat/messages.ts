import type { NextApiRequest, NextApiResponse } from 'next'
import db from '../../../lib/db'
import { requireAuth } from '../../../lib/session'
import { encryptText, decryptText } from '../../../lib/secure'
import { ensureParticipant, getOrCreateConversation } from '../../../lib/conversations'

type StoredMessage = {
  id: number
  sender_id: number
  iv: string
  auth_tag: string
  ciphertext: string
  created_at: string
}

const PAGE_SIZE_DEFAULT = 20
const PAGE_SIZE_MAX = 50

const listMessages = (conversationId: number, beforeId?: number | null, limit?: number): StoredMessage[] => {
  const pageSize = Math.min(Math.max(limit ?? PAGE_SIZE_DEFAULT, 1), PAGE_SIZE_MAX)
  const baseQuery =
    'SELECT id, sender_id, iv, auth_tag, ciphertext, created_at FROM messages WHERE conversation_id = ?'
  const params: Array<number> = [conversationId]
  let sql = baseQuery
  if (beforeId && Number.isFinite(beforeId)) {
    sql += ' AND id < ?'
    params.push(beforeId)
  }
  sql += ' ORDER BY id DESC LIMIT ?'
  params.push(pageSize)
  const stmt = db.prepare(sql)
  const rows = stmt.all(...params) as StoredMessage[]
  return rows
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
    const beforeId = req.query.before ? Number(req.query.before) : undefined
    if (beforeId !== undefined && (Number.isNaN(beforeId) || beforeId <= 0)) {
      res.status(400).json({ error: 'invalid_cursor' })
      return
    }
    const limit = req.query.limit ? Number(req.query.limit) : undefined
    if (limit !== undefined && (Number.isNaN(limit) || limit <= 0)) {
      res.status(400).json({ error: 'invalid_limit' })
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
    const rows = listMessages(conversation.id, beforeId, limit)
    const messages = rows
      .slice()
      .reverse()
      .map((message) => ({
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

    let nextCursor: number | null = null
    let hasMore = false
    if (messages.length > 0) {
      nextCursor = messages[0].id
      const older = db
        .prepare('SELECT 1 FROM messages WHERE conversation_id = ? AND id < ? LIMIT 1')
        .get(conversation.id, messages[0].id) as { 1: number } | undefined
      hasMore = Boolean(older)
    }

    res.status(200).json({ conversationId: conversation.id, messages, hasMore, nextCursor })
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
