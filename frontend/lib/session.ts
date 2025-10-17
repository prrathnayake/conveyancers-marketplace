import type { IncomingHttpHeaders } from 'http'
import jwt, { type JwtPayload } from 'jsonwebtoken'
import crypto from 'crypto'
import * as cookie from 'cookie'
import type { SerializeOptions } from 'cookie'
import db from './db'

type JwtSession = {
  sub: number
  role: 'buyer' | 'seller' | 'conveyancer' | 'admin'
}

export type SessionUser = {
  id: number
  email: string
  role: JwtSession['role']
  fullName: string
}

const detectAppScope = (): 'admin' | 'public' => {
  const explicit = process.env.SESSION_APP_SCOPE?.trim().toLowerCase()
  if (explicit === 'admin' || explicit === 'public') {
    return explicit
  }
  const normalizedCwd = process.cwd().replace(/\\/g, '/').toLowerCase()
  if (normalizedCwd.includes('/admin-portal')) {
    return 'admin'
  }
  return 'public'
}

const APP_SCOPE = detectAppScope()

const COOKIE_NAME =
  process.env.SESSION_COOKIE_NAME?.trim() ||
  (APP_SCOPE === 'admin' ? 'admin_session_token' : 'session_token')

const MAX_AGE_SECONDS = 60 * 60 * 12

declare global {
  // eslint-disable-next-line no-var
  var __conveyancersSessionSecret__: string | undefined
}

const resolveDevelopmentSecret = (): string => {
  if (!globalThis.__conveyancersSessionSecret__) {
    globalThis.__conveyancersSessionSecret__ = crypto.randomBytes(32).toString('hex')
    console.warn('JWT_SECRET is not set. Generated ephemeral secret for development use only.')
  }
  return globalThis.__conveyancersSessionSecret__
}

const jwtSecret = (): string => {
  const secret = process.env.JWT_SECRET
  if (secret && secret.length > 0) {
    return secret
  }

  if (process.env.NODE_ENV !== 'production') {
    return resolveDevelopmentSecret()
  }

  throw new Error('JWT_SECRET environment variable is not configured')
}

const serializeCookie = (value: string, options: SerializeOptions = {}): string => {
  return cookie.serialize(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    ...options,
  })
}

export const createSessionCookie = (session: JwtSession): string => {
  const token = jwt.sign(session, jwtSecret(), { expiresIn: MAX_AGE_SECONDS })
  return serializeCookie(token, { maxAge: MAX_AGE_SECONDS })
}

export const destroySessionCookie = (): string => serializeCookie('', { maxAge: 0 })

const decodeSession = (token: string): JwtSession | null => {
  try {
    const payload = jwt.verify(token, jwtSecret())
    if (typeof payload === 'string') {
      return null
    }
    const candidate = payload as JwtPayload & Partial<JwtSession>
    if (typeof candidate.sub !== 'string' && typeof candidate.sub !== 'number') {
      return null
    }
    const validRoles: JwtSession['role'][] = ['buyer', 'seller', 'conveyancer', 'admin']
    if (!candidate.role || !validRoles.includes(candidate.role)) {
      return null
    }
    return {
      sub: Number(candidate.sub),
      role: candidate.role,
    }
  } catch {
    return null
  }
}

const mapUser = (row: any): SessionUser | null => {
  if (!row) return null
  return {
    id: row.id as number,
    email: row.email as string,
    role: row.role as SessionUser['role'],
    fullName: row.full_name as string,
  }
}

export const getUserById = (id: number): SessionUser | null => {
  const stmt = db.prepare('SELECT id, email, role, full_name FROM users WHERE id = ?')
  return mapUser(stmt.get(id))
}

type RequestWithCookies = {
  headers: IncomingHttpHeaders & { cookie?: string | string[] }
}

type ResponseWithJson = {
  status: (statusCode: number) => { json: (body: any) => any }
}

export const getSessionFromRequest = (req: RequestWithCookies): SessionUser | null => {
  const cookiesHeader = req.headers.cookie
  if (!cookiesHeader) {
    return null
  }
  const cookies = cookie.parse(Array.isArray(cookiesHeader) ? cookiesHeader.join('; ') : cookiesHeader)
  const token = cookies[COOKIE_NAME]
  if (!token) {
    return null
  }
  const session = decodeSession(token)
  if (!session) {
    return null
  }
  return getUserById(session.sub)
}

export const requireRole = (
  req: RequestWithCookies,
  res: ResponseWithJson,
  roles: SessionUser['role'][]
): SessionUser | null => {
  const user = getSessionFromRequest(req)
  if (!user || !roles.includes(user.role)) {
    res.status(403).json({ error: 'forbidden' })
    return null
  }
  return user
}

export const requireAuth = (req: RequestWithCookies, res: ResponseWithJson): SessionUser | null => {
  const user = getSessionFromRequest(req)
  if (!user) {
    res.status(401).json({ error: 'unauthorized' })
    return null
  }
  return user
}
