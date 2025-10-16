import type { NextApiRequest } from 'next'

const HEADER_NAME = 'authorization'
const PREFIX = 'bearer '

export const extractBearerToken = (req: NextApiRequest): string | null => {
  const header = req.headers[HEADER_NAME]
  if (!header) {
    return null
  }

  const value = Array.isArray(header) ? header[0] : header
  if (!value) {
    return null
  }

  if (value.toLowerCase().startsWith(PREFIX)) {
    return value.slice(PREFIX.length)
  }
  return value
}

export const ensureDevToken = (req: NextApiRequest): boolean => {
  const requiredToken = process.env.DEV_SEED_ACCESS_TOKEN
  if (!requiredToken) {
    console.warn('DEV_SEED_ACCESS_TOKEN is not configured')
    return false
  }

  const provided = extractBearerToken(req)
  return provided === requiredToken
}
