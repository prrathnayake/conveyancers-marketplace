import type { NextApiRequest, NextApiResponse } from 'next'

import { decryptJsonPayload } from '../../../lib/crypto'

const DEFAULT_GATEWAY_ORIGIN = 'http://127.0.0.1:8080'

const loadFallbackProfiles = () => {
  const secret = process.env.PROFILE_FALLBACK_SECRET ?? ''
  const payload = process.env.PROFILE_FALLBACK_PAYLOAD ?? ''
  return (
    decryptJsonPayload<
      Array<{ id: string; name: string; state: string; suburb: string; verified: boolean }>
    >({
      secretBase64: secret,
      payloadBase64: payload,
    }) ?? []
  )
}

const buildQueryString = (query: NextApiRequest['query']): string => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item))
    } else if (value !== undefined) {
      params.set(key, value)
    }
  }
  const serialized = params.toString()
  return serialized ? `?${serialized}` : ''
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const gatewayOrigin = process.env.GATEWAY_ORIGIN ?? DEFAULT_GATEWAY_ORIGIN
  const targetUrl = `${gatewayOrigin.replace(/\/$/, '')}/api/profiles/search${buildQueryString(req.query)}`

  try {
    const response = await fetch(targetUrl, {
      headers: {
        Accept: 'application/json',
      },
    })

    const contentType = response.headers.get('content-type') ?? 'application/json'
    res.status(response.status)

    if (!response.ok) {
      throw new Error(`Gateway responded with status ${response.status}`)
    }

    if (contentType.includes('application/json')) {
      const body = await response.json()
      res.json(body)
      return
    }

    const textBody = await response.text()
    res.setHeader('Content-Type', contentType)
    res.send(textBody)
  } catch (error) {
    res.setHeader('X-Data-Source', 'fallback')
    res.status(200).json(loadFallbackProfiles())
  }
}
