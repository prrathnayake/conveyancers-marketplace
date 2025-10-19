import type { NextApiRequest, NextApiResponse } from 'next'

import { escalateAiChatSession } from '../../../lib/aiChat'

type EscalationResponse = {
  summary: string
}

type ErrorResponse = {
  error: string
}

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse<EscalationResponse | ErrorResponse>,
): Promise<void> => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  try {
    const { sessionId } = req.body as { sessionId?: string }
    if (typeof sessionId !== 'string' || !sessionId) {
      res.status(400).json({ error: 'invalid_payload' })
      return
    }
    const result = escalateAiChatSession(sessionId)
    res.status(200).json({ summary: result.summary })
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? (error as { code?: string }).code : undefined
    if (code === 'ai_chat_session_not_found') {
      res.status(404).json({ error: 'session_not_found' })
      return
    }
    console.error('Failed to escalate AI chat session', error)
    res.status(500).json({ error: 'ai_chat_escalation_failed' })
  }
}

export default handler
