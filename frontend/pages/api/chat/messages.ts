import type { NextApiRequest, NextApiResponse } from 'next'
import db from '../../../lib/db'
import { requireAuth } from '../../../lib/session'
import { encryptText, decryptText } from '../../../lib/secure'
import { ensureParticipant, getOrCreateConversation } from '../../../lib/conversations'

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const phonePattern = /(?:(?:\+?61|0)[\s-]?)?(?:\(?0?[2-9]\)?[\s-]?)?[0-9]{3}[\s-]?[0-9]{3}[\s-]?[0-9]{3,4}/
const offPlatformKeywords = /(call\s+me|text\s+me|email\s+me|whatsapp|signal|telegram|zoom\s+call|offline\s+payment)/i

const detectPolicyWarning = (message: string): { flagType: string; reason: string } | null => {
  if (emailPattern.test(message)) {
    return {
      flagType: 'contact_email',
      reason: 'Detected an email address. Keep communication inside ConveySafe chat for compliance.',
    }
  }
  if (phonePattern.test(message)) {
    return {
      flagType: 'contact_phone',
      reason: 'Detected phone details. Settlement evidence only remains intact inside ConveySafe chat.',
    }
  }
  if (offPlatformKeywords.test(message)) {
    return {
      flagType: 'contact_phrase',
      reason: 'Detected a request to move off-platform. Use ConveySafe tools to stay protected.',
    }
  }
  return null
}

type StoredMessage = {
  id: number
  sender_id: number
  iv: string
  auth_tag: string
  ciphertext: string
  created_at: string
}

type InvoiceRow = {
  id: number
  conversation_id: number
  creator_id: number
  recipient_id: number
  amount_cents: number
  currency: string
  description: string
  status: string
  service_fee_cents: number
  escrow_cents: number
  refunded_cents: number
  created_at: string
  accepted_at: string | null
  released_at: string | null
  cancelled_at: string | null
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

const listInvoices = (conversationId: number): InvoiceRow[] => {
  const stmt = db.prepare(
    `SELECT id, conversation_id, creator_id, recipient_id, amount_cents, currency, description, status,
            service_fee_cents, escrow_cents, refunded_cents, created_at, accepted_at, released_at, cancelled_at
       FROM chat_invoices WHERE conversation_id = ? ORDER BY created_at ASC`
  )
  return stmt.all(conversationId) as InvoiceRow[]
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

    const invoices = listInvoices(conversation.id).map((invoice) => ({
      id: invoice.id,
      conversationId: invoice.conversation_id,
      creatorId: invoice.creator_id,
      recipientId: invoice.recipient_id,
      amountCents: invoice.amount_cents,
      currency: invoice.currency,
      description: invoice.description,
      status: invoice.status,
      serviceFeeCents: invoice.service_fee_cents,
      escrowCents: invoice.escrow_cents,
      refundedCents: invoice.refunded_cents,
      createdAt: invoice.created_at,
      acceptedAt: invoice.accepted_at,
      releasedAt: invoice.released_at,
      cancelledAt: invoice.cancelled_at,
    }))

    res.status(200).json({ conversationId: conversation.id, messages, hasMore, nextCursor, invoices })
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

    const trimmedBody = body.trim()
    const encrypted = encryptText(trimmedBody)
    const insert = db.prepare(
      'INSERT INTO messages (conversation_id, sender_id, iv, auth_tag, ciphertext) VALUES (?, ?, ?, ?, ?)'
    )
    const info = insert.run(conversation.id, user.id, encrypted.iv, encrypted.authTag, encrypted.ciphertext)
    const warning = detectPolicyWarning(trimmedBody)
    if (warning) {
      db.prepare(
        'INSERT INTO message_policy_flags (message_id, reason, flag_type) VALUES (?, ?, ?)'
      ).run(Number(info.lastInsertRowid), warning.reason, warning.flagType)
    }
    res.status(201).json({
      messageId: Number(info.lastInsertRowid),
      policyWarning: warning?.reason,
    })
    return
  }

  res.setHeader('Allow', ['GET', 'POST'])
  res.status(405).end('Method Not Allowed')
}

export default handler
