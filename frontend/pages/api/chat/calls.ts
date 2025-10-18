import type { NextApiRequest, NextApiResponse } from 'next'
import { randomBytes, randomUUID } from 'crypto'

import db from '../../../lib/db'
import { requireAuth } from '../../../lib/session'
import { ensureParticipant, getOrCreateConversation } from '../../../lib/conversations'

const generateRoomId = (): string => {
  if (typeof randomUUID === 'function') {
    return randomUUID()
  }
  return randomBytes(16).toString('hex')
}

const generateAccessToken = (): string => {
  return randomBytes(18).toString('hex')
}

type CallSessionRow = {
  id: number
  conversation_id: number
  type: string
  status: string
  join_url: string
  access_token: string
  created_by: number
  created_at: string
}

const serializeCall = (row: CallSessionRow) => ({
  id: row.id,
  conversationId: row.conversation_id,
  type: row.type as 'voice' | 'video',
  status: row.status,
  joinUrl: row.join_url,
  accessToken: row.access_token,
  createdBy: row.created_by,
  createdAt: row.created_at,
})

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
    const rows = db
      .prepare(
        `SELECT id, conversation_id, type, status, join_url, access_token, created_by, created_at
         FROM call_sessions WHERE conversation_id = ? ORDER BY created_at DESC`
      )
      .all(conversation.id) as CallSessionRow[]
    res.status(200).json({ callSessions: rows.map(serializeCall) })
    return
  }

  if (req.method === 'POST') {
    const { partnerId, type } = req.body as { partnerId?: number; type?: string }
    if (!partnerId || Number.isNaN(Number(partnerId))) {
      res.status(400).json({ error: 'invalid_partner' })
      return
    }
    if (type !== 'voice' && type !== 'video') {
      res.status(400).json({ error: 'invalid_call_type' })
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
    const createdAt = new Date().toISOString()
    const joinUrl = `https://calls.conveysafe.au/session/${generateRoomId()}`
    const accessToken = generateAccessToken()
    const insert = db.prepare(
      `INSERT INTO call_sessions (conversation_id, type, status, join_url, access_token, created_by, created_at)
       VALUES (?, ?, 'scheduled', ?, ?, ?, ?)`
    )
    const info = insert.run(conversation.id, type, joinUrl, accessToken, user.id, createdAt)
    const callSession = serializeCall({
      id: Number(info.lastInsertRowid),
      conversation_id: conversation.id,
      type,
      status: 'scheduled',
      join_url: joinUrl,
      access_token: accessToken,
      created_by: user.id,
      created_at: createdAt,
    })
    res.status(201).json({ callSession })
    return
  }

  res.setHeader('Allow', ['GET', 'POST'])
  res.status(405).end('Method Not Allowed')
}

export default handler
