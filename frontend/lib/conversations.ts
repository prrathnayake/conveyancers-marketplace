import db from './db'

export type ConversationRecord = {
  id: number
  participantA: number
  participantB: number
}

const normalisePair = (a: number, b: number): [number, number] => {
  return a < b ? [a, b] : [b, a]
}

export const getOrCreateConversation = (userA: number, userB: number): ConversationRecord => {
  if (userA === userB) {
    throw new Error('Cannot create a conversation with yourself')
  }
  const [participantA, participantB] = normalisePair(userA, userB)
  const getStmt = db.prepare(
    'SELECT id, participant_a, participant_b FROM conversations WHERE participant_a = ? AND participant_b = ?'
  )
  const existing = getStmt.get(participantA, participantB) as
    | {
        id: number
        participant_a: number
        participant_b: number
      }
    | undefined
  if (existing) {
    return {
      id: existing.id as number,
      participantA: existing.participant_a as number,
      participantB: existing.participant_b as number,
    }
  }
  const insertStmt = db.prepare(
    'INSERT INTO conversations (participant_a, participant_b) VALUES (?, ?)'
  )
  const info = insertStmt.run(participantA, participantB)
  return {
    id: Number(info.lastInsertRowid),
    participantA,
    participantB,
  }
}

export const listParticipants = (userId: number): ConversationRecord[] => {
  const stmt = db.prepare(
    'SELECT id, participant_a, participant_b FROM conversations WHERE participant_a = ? OR participant_b = ? ORDER BY created_at DESC'
  )
  const rows = stmt.all(userId, userId) as Array<{
    id: number
    participant_a: number
    participant_b: number
  }>
  return rows.map((row) => ({
    id: row.id as number,
    participantA: row.participant_a as number,
    participantB: row.participant_b as number,
  }))
}

export const ensureParticipant = (conversationId: number, userId: number): boolean => {
  const stmt = db.prepare(
    'SELECT 1 FROM conversations WHERE id = ? AND (participant_a = ? OR participant_b = ?)' 
  )
  const row = stmt.get(conversationId, userId, userId)
  return Boolean(row)
}
