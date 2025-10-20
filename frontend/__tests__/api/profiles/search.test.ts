import { createMocks } from 'node-mocks-http'

jest.mock('../../../lib/observability', () => ({
  withObservability: (handler: any) => handler,
}))

const allMock = jest.fn()

jest.mock('../../../lib/db', () => ({
  __esModule: true,
  default: { prepare: jest.fn(() => ({ all: allMock })) },
}))

jest.mock('../../../lib/session', () => ({
  getSessionFromRequest: jest.fn(),
}))

jest.mock('../../../pages/api/profiles/[id]', () => ({
  restrictedStates: new Set(['nsw']),
}))

import handler, { parseSpecialties } from '../../../pages/api/profiles/search'
import db from '../../../lib/db'
import { getSessionFromRequest } from '../../../lib/session'

describe('/api/profiles/search', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(db.prepare as jest.Mock).mockImplementation(() => ({ all: allMock }))
    allMock.mockReset()
  })

  it('rejects non-GET methods', async () => {
    const { req, res } = createMocks({ method: 'POST' })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(405)
    expect(res._getJSONData()).toEqual({ error: 'method_not_allowed' })
  })

  it('filters restricted states for non-admin viewers', async () => {
    allMock.mockReturnValue([
      {
        id: 1,
        full_name: 'Jane Convey',
        firm_name: 'ConveyPro',
        state: 'NSW',
        suburb: 'Sydney',
        verified: 0,
        remote_friendly: 1,
        turnaround: '2 days',
        response_time: '1h',
        specialties: '["commercial"]',
        rating: 4.9,
        review_count: 12,
      },
      {
        id: 2,
        full_name: 'John Verified',
        firm_name: 'Trusted Conveyancing',
        state: 'NSW',
        suburb: 'Sydney',
        verified: 1,
        remote_friendly: 0,
        turnaround: '3 days',
        response_time: '2h',
        specialties: '["residential"]',
        rating: 4.5,
        review_count: 5,
      },
    ])
    ;(getSessionFromRequest as jest.Mock).mockReturnValue({ id: 'user-1', role: 'buyer' })

    const { req, res } = createMocks({ method: 'GET', query: { state: 'NSW' } })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(200)
    const results = res._getJSONData()
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ id: 'conveyancer_2', verified: true })
  })

  it('allows admins to view restricted states', async () => {
    allMock.mockReturnValue([
      {
        id: 3,
        full_name: 'Admin Allowed',
        firm_name: 'Admin Co',
        state: 'NSW',
        suburb: 'Sydney',
        verified: 0,
        remote_friendly: 0,
        turnaround: '4 days',
        response_time: '3h',
        specialties: '["rural"]',
        rating: 4.0,
        review_count: 2,
      },
    ])
    ;(getSessionFromRequest as jest.Mock).mockReturnValue({ id: 'admin', role: 'admin' })

    const { req, res } = createMocks({ method: 'GET', query: { state: 'NSW' } })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(200)
    const results = res._getJSONData()
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ id: 'conveyancer_3' })
  })
})

describe('parseSpecialties', () => {
  it('returns empty array for invalid json', () => {
    expect(parseSpecialties('not json')).toEqual([])
  })

  it('returns only string entries', () => {
    expect(parseSpecialties('["residential", 123, null]')).toEqual(['residential'])
  })
})
