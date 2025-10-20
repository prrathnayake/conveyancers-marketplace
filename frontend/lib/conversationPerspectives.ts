import db from './db'

export type ConversationPerspective = {
  conversationId: number
  userId: number
  perspective: 'buyer' | 'seller'
  updatedAt: string
}

const allowedPerspectives = new Set<ConversationPerspective['perspective']>(['buyer', 'seller'])

export const isConversationPerspective = (value: unknown): value is ConversationPerspective['perspective'] => {
  return typeof value === 'string' && allowedPerspectives.has(value as ConversationPerspective['perspective'])
}

export const listConversationPerspectives = (conversationId: number): ConversationPerspective[] => {
  const stmt = db.prepare(
    `SELECT conversation_id, user_id, perspective, updated_at
       FROM conversation_perspectives
      WHERE conversation_id = ?`
  )
  const rows = stmt.all(conversationId) as Array<{
    conversation_id: number
    user_id: number
    perspective: string
    updated_at: string
  }>
  return rows
    .filter((row) => isConversationPerspective(row.perspective))
    .map((row) => ({
      conversationId: row.conversation_id,
      userId: row.user_id,
      perspective: row.perspective as ConversationPerspective['perspective'],
      updatedAt: row.updated_at,
    }))
}

export const getConversationPerspective = (conversationId: number, userId: number): ConversationPerspective | null => {
  const stmt = db.prepare(
    `SELECT conversation_id, user_id, perspective, updated_at
       FROM conversation_perspectives
      WHERE conversation_id = ? AND user_id = ?`
  )
  const row = stmt.get(conversationId, userId) as
    | { conversation_id: number; user_id: number; perspective: string; updated_at: string }
    | undefined
  if (!row || !isConversationPerspective(row.perspective)) {
    return null
  }
  return {
    conversationId: row.conversation_id,
    userId: row.user_id,
    perspective: row.perspective,
    updatedAt: row.updated_at,
  }
}

export const upsertConversationPerspective = (
  conversationId: number,
  userId: number,
  perspective: ConversationPerspective['perspective'],
): ConversationPerspective => {
  const stmt = db.prepare(
    `INSERT INTO conversation_perspectives (conversation_id, user_id, perspective)
     VALUES (?, ?, ?)
     ON CONFLICT(conversation_id, user_id)
     DO UPDATE SET perspective = excluded.perspective, updated_at = CURRENT_TIMESTAMP`
  )
  stmt.run(conversationId, userId, perspective)
  const record = getConversationPerspective(conversationId, userId)
  if (!record) {
    throw new Error('Unable to persist conversation perspective')
  }
  return record
}
