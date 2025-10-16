import type { NextApiRequest, NextApiResponse } from 'next'

import db from '../../../frontend/lib/db'
import { requireRole } from '../../../frontend/lib/session'
import { decryptText } from '../../../frontend/lib/secure'

type ParticipantSummary = {
  id: number
  fullName: string
  email: string
  role: string
}

type EnquiryResult = {
  messageId: number
  conversationId: number
  createdAt: string
  body: string
  sender: ParticipantSummary
  participants: ParticipantSummary[]
  attachments: Array<{ id: number; filename: string; mimeType: string }>
}

type EnquiryResponse = {
  results: EnquiryResult[]
  total: number
}

const MAX_WINDOW = 500
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

const handler = (
  req: NextApiRequest,
  res: NextApiResponse<EnquiryResponse | { error: string }>
): void => {
  const user = requireRole(req, res, ['admin'])
  if (!user) {
    return
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const rawQuery = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q
  const query = rawQuery ? rawQuery.trim() : ''
  const lowerQuery = query.toLowerCase()

  const limitParam = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit
  const parsedLimit = limitParam ? Number(limitParam) : undefined
  const limit = parsedLimit && !Number.isNaN(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), MAX_LIMIT)
    : DEFAULT_LIMIT

  const rows = db
    .prepare(
      `SELECT m.id,
              m.conversation_id,
              m.sender_id,
              m.iv,
              m.auth_tag,
              m.ciphertext,
              m.created_at,
              s.full_name AS sender_name,
              s.email AS sender_email,
              s.role AS sender_role,
              c.participant_a,
              c.participant_b,
              ua.full_name AS participant_a_name,
              ua.email AS participant_a_email,
              ua.role AS participant_a_role,
              ub.full_name AS participant_b_name,
              ub.email AS participant_b_email,
              ub.role AS participant_b_role
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         JOIN users s ON s.id = m.sender_id
         JOIN users ua ON ua.id = c.participant_a
         JOIN users ub ON ub.id = c.participant_b
        ORDER BY m.created_at DESC
        LIMIT ?`
    )
    .all(MAX_WINDOW) as Array<{
      id: number
      conversation_id: number
      sender_id: number
      iv: string
      auth_tag: string
      ciphertext: string
      created_at: string
      sender_name: string
      sender_email: string
      sender_role: string
      participant_a: number
      participant_b: number
      participant_a_name: string
      participant_a_email: string
      participant_a_role: string
      participant_b_name: string
      participant_b_email: string
      participant_b_role: string
    }>

  const matches: EnquiryResult[] = []

  for (const row of rows) {
    const participantHaystack = [
      row.sender_name,
      row.sender_email,
      row.participant_a_name,
      row.participant_a_email,
      row.participant_b_name,
      row.participant_b_email,
    ]
      .filter(Boolean)
      .map((value) => value.toLowerCase())
      .join(' ')

    let include = lowerQuery.length === 0 || participantHaystack.includes(lowerQuery)
    let body = ''

    if (!include) {
      body = decryptText({ iv: row.iv, authTag: row.auth_tag, ciphertext: row.ciphertext })
      if (body.toLowerCase().includes(lowerQuery)) {
        include = true
      }
    }

    if (!include) {
      continue
    }

    if (!body) {
      body = decryptText({ iv: row.iv, authTag: row.auth_tag, ciphertext: row.ciphertext })
    }

    const attachments = db
      .prepare('SELECT id, filename, mime_type FROM message_files WHERE message_id = ? ORDER BY created_at ASC')
      .all(row.id) as Array<{ id: number; filename: string; mime_type: string }>

    matches.push({
      messageId: row.id,
      conversationId: row.conversation_id,
      createdAt: row.created_at,
      body,
      sender: {
        id: row.sender_id,
        fullName: row.sender_name,
        email: row.sender_email,
        role: row.sender_role,
      },
      participants: [
        {
          id: row.participant_a,
          fullName: row.participant_a_name,
          email: row.participant_a_email,
          role: row.participant_a_role,
        },
        {
          id: row.participant_b,
          fullName: row.participant_b_name,
          email: row.participant_b_email,
          role: row.participant_b_role,
        },
      ],
      attachments: attachments.map((file) => ({
        id: file.id,
        filename: file.filename,
        mimeType: file.mime_type,
      })),
    })
  }

  const limited = matches.slice(0, limit)
  res.status(200).json({ results: limited, total: matches.length })
}

export default handler
