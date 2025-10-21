import { createMocks } from 'node-mocks-http'

jest.mock('../../../lib/observability', () => ({
  withObservability: (handler: any) => handler,
}))

jest.mock('../../../lib/session', () => ({
  requireAuth: jest.fn(() => ({ id: 42 })),
}))

jest.mock('../../../lib/db', () => {
  const policyFlagRuns: Array<{ sql: string; args: unknown[] }> = []
  const messageInsertRun = jest.fn(() => ({ lastInsertRowid: 99, changes: 1 }))
  const prepareMock = jest.fn((sql: string) => {
    if (sql.startsWith('SELECT 1 FROM users')) {
      return {
        get: jest.fn(() => ({ 1: 1 })),
        all: jest.fn(() => []),
        run: jest.fn(),
      }
    }

    if (sql.startsWith('INSERT INTO messages')) {
      return {
        run: messageInsertRun,
        get: jest.fn(),
        all: jest.fn(() => []),
      }
    }

    if (sql.startsWith('INSERT INTO message_policy_flags')) {
      const run = jest.fn((...args: unknown[]) => {
        policyFlagRuns.push({ sql, args })
        return { lastInsertRowid: 0, changes: 1 }
      })
      return {
        run,
        get: jest.fn(),
        all: jest.fn(() => []),
      }
    }

    return {
      get: jest.fn(() => undefined),
      all: jest.fn(() => []),
      run: jest.fn(() => ({ lastInsertRowid: 0, changes: 0 })),
    }
  })

  return {
    __esModule: true,
    default: { prepare: prepareMock },
    __mockHelpers: { policyFlagRuns, messageInsertRun, prepareMock },
  }
})

jest.mock('../../../lib/conversations', () => ({
  getOrCreateConversation: jest.fn(() => ({ id: 1 })),
  ensureParticipant: jest.fn(() => true),
}))

jest.mock('../../../lib/conversationPerspectives', () => ({
  listConversationPerspectives: jest.fn(() => []),
}))

jest.mock('../../../lib/secure', () => ({
  encryptText: jest.fn(() => ({ iv: 'iv', authTag: 'tag', ciphertext: 'cipher' })),
  decryptText: jest.fn(() => 'decrypted'),
}))

jest.mock('../../../lib/ml/sensitive', () => {
  const mockAssessSensitiveContent = jest.fn(() => ({ score: 0, indicators: [] as string[] }))
  return {
    __esModule: true,
    assessSensitiveContent: mockAssessSensitiveContent,
    SENSITIVE_RISK_THRESHOLD: 0.8,
    __mock: { mockAssessSensitiveContent },
  }
})

import handler, { detectPolicyWarning } from '../../../pages/api/chat/messages'

const {
  __mockHelpers: dbMocks,
} = jest.requireMock('../../../lib/db') as {
  __mockHelpers: {
    policyFlagRuns: Array<{ sql: string; args: unknown[] }>
    messageInsertRun: jest.Mock
    prepareMock: jest.Mock
  }
}

const {
  mockAssessSensitiveContent,
} = (jest.requireMock('../../../lib/ml/sensitive') as {
  __mock: { mockAssessSensitiveContent: jest.Mock }
}).__mock

const { policyFlagRuns, messageInsertRun, prepareMock } = dbMocks

beforeEach(() => {
  mockAssessSensitiveContent.mockReset()
  mockAssessSensitiveContent.mockReturnValue({ score: 0, indicators: [] })
  policyFlagRuns.length = 0
  prepareMock.mockClear()
  messageInsertRun.mockClear()
})

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

  it('records machine learning sensitive content flags when thresholds are exceeded', async () => {
    const messageBody = "Let's keep chatting here."
    mockAssessSensitiveContent.mockReturnValueOnce({
      score: 0.92,
      indicators: ['Composite sensitive signal'],
    })

    const { req, res } = createMocks({
      method: 'POST',
      body: { partnerId: 7, body: messageBody },
    })

    await handler(req as any, res as any)

    expect(res._getStatusCode()).toBe(201)
    expect(res._getJSONData()).toEqual(
      expect.objectContaining({
        mlRiskScore: 0.92,
        mlIndicators: ['Composite sensitive signal'],
      })
    )

    expect(policyFlagRuns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sql: expect.stringContaining('INSERT INTO message_policy_flags'),
          args: expect.arrayContaining([
            expect.any(Number),
            expect.stringContaining('ML risk 0.92'),
            'ml_sensitive_risk',
          ]),
        }),
      ])
    )
    expect(messageInsertRun).toHaveBeenCalledWith(1, 42, 'iv', 'tag', 'cipher')
  })
})
