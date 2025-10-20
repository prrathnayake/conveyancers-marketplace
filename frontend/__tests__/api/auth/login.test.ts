import { createMocks } from 'node-mocks-http'

jest.mock('../../../lib/observability', () => ({
  withObservability: (handler: any) => handler,
}))

jest.mock('../../../lib/services/identity', () => ({
  login: jest.fn(),
  reportIdentityError: jest.fn(),
}))

import handler from '../../../pages/api/auth/login'
import { login as identityLogin, reportIdentityError } from '../../../lib/services/identity'

describe('/api/auth/login', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('rejects non-POST methods', async () => {
    const { req, res } = createMocks({ method: 'GET' })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(405)
    expect(res._getData()).toContain('Method Not Allowed')
  })

  it('returns 400 when email or password missing', async () => {
    const { req, res } = createMocks({ method: 'POST', body: { email: 'user@example.com' } })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(400)
    expect(res._getJSONData()).toEqual({ error: 'missing_fields' })
  })

  it('responds with identity result on success', async () => {
    ;(identityLogin as jest.Mock).mockResolvedValue({
      cookies: ['session=abc'],
      expiresAt: '2024-01-01T00:00:00Z',
      verificationRequired: false,
    })
    const { req, res } = createMocks({
      method: 'POST',
      body: { email: 'user@example.com', password: 'secret' },
    })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(200)
    expect(res._getHeaders()['set-cookie']).toEqual(['session=abc'])
    expect(res._getJSONData()).toMatchObject({ ok: true, verificationRequired: false })
  })

  it('maps identity errors to http responses', async () => {
    ;(identityLogin as jest.Mock).mockRejectedValue({ code: 'invalid_credentials' })
    const { req, res } = createMocks({
      method: 'POST',
      body: { email: 'user@example.com', password: 'bad' },
    })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(401)
    expect(res._getJSONData()).toEqual({ error: 'invalid_credentials' })
    expect(reportIdentityError).not.toHaveBeenCalled()
  })
})
