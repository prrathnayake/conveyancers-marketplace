import type { NextApiRequest, NextApiResponse } from 'next'

import {
  appendAiChatMessage,
  createAiChatSession,
  getAiChatSession,
  listAiChatMessages,
  type AiChatPersona,
} from '../../../lib/aiChat'
import { initialMessageForPersona } from '../../../lib/aiResponder'

type SessionResponse = {
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

const allowedPersonas: AiChatPersona[] = ['assistant', 'cat']

const resolvePersona = (input: unknown): AiChatPersona => {
  if (typeof input === 'string' && allowedPersonas.includes(input as AiChatPersona)) {
    return input as AiChatPersona
  }
  return 'assistant'
}

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse<SessionResponse | ErrorResponse>,
): Promise<void> => {
  if (req.method === 'GET') {
    const sessionIdParam = req.query.sessionId
    const sessionId = Array.isArray(sessionIdParam) ? sessionIdParam[0] : sessionIdParam
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ error: 'invalid_session' })
      return
    }

    try {
      const session = getAiChatSession(sessionId)
      if (!session) {
        res.status(404).json({ error: 'session_not_found' })
        return
      }
      const messages = listAiChatMessages(sessionId)
      res.status(200).json({
        sessionId: session.id,
        persona: session.persona,
        status: session.status,
        summary: session.summary,
        messages,
      })
    } catch (error) {
      console.error('Failed to load AI chat session', error)
      res.status(500).json({ error: 'ai_chat_session_failed' })
    }
    return
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  try {
    const persona = resolvePersona((req.body as { persona?: string } | undefined)?.persona)
    const origin = typeof req.headers.referer === 'string' ? req.headers.referer : ''
    const session = createAiChatSession(persona, origin)
    const greeting = initialMessageForPersona(persona)
    appendAiChatMessage({ sessionId: session.id, role: 'assistant', content: greeting })
    const messages = listAiChatMessages(session.id)
    res.status(201).json({
      sessionId: session.id,
      persona: session.persona,
      status: session.status,
      summary: session.summary,
      messages,
    })
  } catch (error) {
    console.error('Failed to create AI chat session', error)
    res.status(500).json({ error: 'ai_chat_session_failed' })
  }
}

export default handler
