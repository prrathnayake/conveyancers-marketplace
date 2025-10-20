import { createMocks } from 'node-mocks-http'

jest.mock('../../../../frontend/lib/services/identity', () => ({
  adminLogin: jest.fn(),
  reportIdentityError: jest.fn(),
}))

import handler from '../../../pages/api/auth/login'
import { adminLogin, reportIdentityError } from '../../../../frontend/lib/services/identity'

describe('admin /api/auth/login', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('rejects unsupported methods', async () => {
    const { req, res } = createMocks({ method: 'GET' })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(405)
  })

  it('validates credentials presence', async () => {
    const { req, res } = createMocks({ method: 'POST', body: {} })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(400)
    expect(res._getJSONData()).toEqual({ error: 'missing_fields' })
  })

  it('returns ok on successful login', async () => {
    ;(adminLogin as jest.Mock).mockResolvedValue({ cookies: ['adminSession=abc'] })
    const { req, res } = createMocks({
      method: 'POST',
      body: { email: 'admin@example.com', password: 'secret' },
    })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(200)
    expect(res._getJSONData()).toEqual({ ok: true })
    expect(res._getHeaders()['set-cookie']).toEqual(['adminSession=abc'])
  })

  it('maps identity errors to responses', async () => {
    ;(adminLogin as jest.Mock).mockRejectedValue({ code: 'account_inactive' })
    const { req, res } = createMocks({
      method: 'POST',
      body: { email: 'admin@example.com', password: 'secret' },
    })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(403)
    expect(res._getJSONData()).toEqual({ error: 'account_inactive' })
    expect(reportIdentityError).not.toHaveBeenCalled()
  })
})
