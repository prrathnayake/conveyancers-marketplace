import { customAlphabet } from 'nanoid'
import db from './db'

export type AiChatPersona = 'assistant' | 'cat'

type AiChatSessionRow = {
  id: string
  persona: string
  origin: string
  status: string
  summary: string
  created_at: string
  updated_at: string
  escalated_at: string | null
}

export type AiChatSession = {
  id: string
  persona: AiChatPersona
  origin: string
  status: 'active' | 'escalated'
  summary: string
  createdAt: string
  updatedAt: string
  escalatedAt: string | null
}

type AiChatMessageRow = {
  id: number
  session_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: string
}

export type AiChatMessage = {
  id: number
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
}

export type AiChatEscalation = {
  id: number
  sessionId: string
  summary: string
  status: string
  createdAt: string
}

const createSessionId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 18)

const mapSession = (row: AiChatSessionRow): AiChatSession => ({
  id: row.id,
  persona: (row.persona ?? 'assistant') as AiChatPersona,
  origin: row.origin ?? '',
  status: (row.status === 'escalated' ? 'escalated' : 'active'),
  summary: row.summary ?? '',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  escalatedAt: row.escalated_at ?? null,
})

const mapMessage = (row: AiChatMessageRow): AiChatMessage => ({
  id: row.id,
  sessionId: row.session_id,
  role: row.role,
  content: row.content,
  createdAt: row.created_at,
})

const selectSessionStmt = db.prepare(
  `SELECT id, persona, origin, status, summary, created_at, updated_at, escalated_at
   FROM ai_chat_sessions
   WHERE id = ?`
)

const selectMessagesStmt = db.prepare(
  `SELECT id, session_id, role, content, created_at
   FROM ai_chat_messages
   WHERE session_id = ?
   ORDER BY created_at ASC, id ASC`
)

const selectMessageByIdStmt = db.prepare(
  `SELECT id, session_id, role, content, created_at FROM ai_chat_messages WHERE id = ?`
)

const insertMessageStmt = db.prepare(
  `INSERT INTO ai_chat_messages (session_id, role, content)
   VALUES (@sessionId, @role, @content)`
)

const touchSessionStmt = db.prepare(`UPDATE ai_chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`)

const countEscalationsStmt = db.prepare(
  `SELECT COUNT(1) as count FROM ai_chat_escalations WHERE session_id = ?`
)

const latestEscalationStmt = db.prepare(
  `SELECT summary FROM ai_chat_escalations WHERE session_id = ? ORDER BY created_at DESC LIMIT 1`
)

const insertEscalationStmt = db.prepare(
  `INSERT INTO ai_chat_escalations (session_id, summary)
   VALUES (?, ?)`
)

const markEscalatedStmt = db.prepare(
  `UPDATE ai_chat_sessions
   SET status = 'escalated', summary = ?, escalated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
   WHERE id = ?`
)

export const createAiChatSession = (persona: AiChatPersona, origin?: string): AiChatSession => {
  const sessionId = createSessionId()
  const insert = db.prepare(
    `INSERT INTO ai_chat_sessions (id, persona, origin)
     VALUES (@id, @persona, @origin)`
  )
  const create = db.transaction(() => {
    insert.run({ id: sessionId, persona, origin: origin ?? '' })
  })
  create()
  const created = selectSessionStmt.get(sessionId) as AiChatSessionRow | undefined
  if (!created) {
    throw new Error('failed_to_create_ai_chat_session')
  }
  return mapSession(created)
}

export const getAiChatSession = (sessionId: string): AiChatSession | null => {
  const row = selectSessionStmt.get(sessionId) as AiChatSessionRow | undefined
  return row ? mapSession(row) : null
}

export const listAiChatMessages = (sessionId: string): AiChatMessage[] => {
  const rows = selectMessagesStmt.all(sessionId) as AiChatMessageRow[]
  return rows.map(mapMessage)
}

type MessagePayload = {
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string
}

export const appendAiChatMessage = ({ sessionId, role, content }: MessagePayload): AiChatMessage => {
  const trimmed = content.trim()
  if (!trimmed) {
    throw new Error('empty_message')
  }
  const info = insertMessageStmt.run({ sessionId, role, content: trimmed })
  const insertedId = Number(info.lastInsertRowid)
  const row = selectMessageByIdStmt.get(insertedId) as AiChatMessageRow | undefined
  touchSessionStmt.run(sessionId)
  if (!row) {
    throw new Error('failed_to_persist_message')
  }
  return mapMessage(row)
}

export const summariseConversation = (messages: AiChatMessage[]): string => {
  if (!messages.length) {
    return 'No conversation history captured yet.'
  }
  const userNotes = messages
    .filter((message) => message.role === 'user')
    .slice(-5)
    .map((message) => message.content.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const assistantHighlights = messages
    .filter((message) => message.role === 'assistant')
    .slice(-5)
    .map((message) => message.content.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const summaryLines: string[] = []
  if (userNotes.length) {
    summaryLines.push('Client focus points:')
    for (const note of userNotes) {
      summaryLines.push(`- ${note}`)
    }
  }
  if (assistantHighlights.length) {
    summaryLines.push('', 'Assistant guidance provided:')
    for (const highlight of assistantHighlights) {
      summaryLines.push(`- ${highlight}`)
    }
  }
  if (!summaryLines.length) {
    return 'Conversation contains system handshakes only so far.'
  }
  return summaryLines.join('\n')
}

export const escalateAiChatSession = (sessionId: string): { summary: string } => {
  const session = getAiChatSession(sessionId)
  if (!session) {
    throw Object.assign(new Error('ai_chat_session_not_found'), { code: 'ai_chat_session_not_found' })
  }
  const existing = countEscalationsStmt.get(sessionId) as { count?: number } | undefined
  if (existing && Number(existing.count ?? 0) > 0) {
    const latest = latestEscalationStmt.get(sessionId) as { summary?: string } | undefined
    return { summary: latest?.summary ?? session.summary }
  }
  const messages = listAiChatMessages(sessionId)
  const summary = summariseConversation(messages)
  const tx = db.transaction(() => {
    insertEscalationStmt.run(sessionId, summary)
    markEscalatedStmt.run(summary, sessionId)
  })
  tx()
  return { summary }
}
