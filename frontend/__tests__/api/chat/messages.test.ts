import { createMocks } from 'node-mocks-http'

jest.mock('../../../lib/observability', () => ({
  withObservability: (handler: any) => handler,
}))

jest.mock('../../../lib/session', () => ({
  requireAuth: jest.fn(() => ({ id: 42 })),
}))

jest.mock('../../../lib/db', () => ({
  __esModule: true,
  default: { prepare: jest.fn(() => ({ get: jest.fn(), all: jest.fn() })) },
}))

jest.mock('../../../lib/conversations', () => ({
  getOrCreateConversation: jest.fn(() => ({ id: 1 })),
  ensureParticipant: jest.fn(() => true),
}))

jest.mock('../../../lib/conversationPerspectives', () => ({
  listConversationPerspectives: jest.fn(() => []),
}))

jest.mock('../../../lib/ml/sensitive', () => ({
  assessSensitiveContent: jest.fn(async () => ({ score: 0 })),
  SENSITIVE_RISK_THRESHOLD: 0.8,
}))

import handler, { detectPolicyWarning } from '../../../pages/api/chat/messages'

describe('detectPolicyWarning', () => {
  it('detects email addresses', () => {
    const result = detectPolicyWarning('Reach me at user@example.com')
    expect(result).toEqual(
      expect.objectContaining({ flagType: 'contact_email' })
    )
  })

  it('returns null when no signals are present', () => {
    expect(detectPolicyWarning('Hello there')).toBeNull()
  })
})

describe('/api/chat/messages handler', () => {
  it('requires a valid partner id', async () => {
    const { req, res } = createMocks({ method: 'GET', query: { partnerId: 'invalid' } })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(400)
    expect(res._getJSONData()).toEqual({ error: 'invalid_partner' })
  })
})
