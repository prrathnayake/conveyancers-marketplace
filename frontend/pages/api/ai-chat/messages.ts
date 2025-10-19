import type { NextApiRequest, NextApiResponse } from 'next'

import {
  appendAiChatMessage,
  getAiChatSession,
  listAiChatMessages,
  type AiChatPersona,
} from '../../../lib/aiChat'
import { generateAssistantReply } from '../../../lib/aiResponder'

type MessageResponse = {
  sessionId: string
  persona: AiChatPersona
  status: 'active' | 'escalated'
  summary: string
  messages: {
    id: number
    role: 'assistant' | 'user' | 'system'
    content: string
    createdAt: string
  }[]
}

type ErrorResponse = {
  error: string
}

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse<MessageResponse | ErrorResponse>,
): Promise<void> => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  try {
    const body = req.body as { sessionId?: string; message?: string }
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    if (!sessionId || !message) {
      res.status(400).json({ error: 'invalid_payload' })
      return
    }
    const session = getAiChatSession(sessionId)
    if (!session) {
      res.status(404).json({ error: 'session_not_found' })
      return
    }
    appendAiChatMessage({ sessionId, role: 'user', content: message })
    const context = listAiChatMessages(sessionId)
    const reply = generateAssistantReply(session.persona, context)
    appendAiChatMessage({ sessionId, role: 'assistant', content: reply })
    const refreshedSession = getAiChatSession(sessionId)
    if (!refreshedSession) {
      res.status(500).json({ error: 'session_not_found' })
      return
    }
    const messages = listAiChatMessages(sessionId)
    res.status(200).json({
      sessionId,
      persona: refreshedSession.persona,
      status: refreshedSession.status,
      summary: refreshedSession.summary,
      messages,
    })
  } catch (error) {
    console.error('Failed to process AI chat message', error)
    res.status(500).json({ error: 'ai_chat_message_failed' })
  }
}

export default handler
