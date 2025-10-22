import type { IncomingHttpHeaders } from 'http'
import jwt, { type JwtPayload } from 'jsonwebtoken'
import crypto from 'crypto'
import * as cookie from 'cookie'
import type { SerializeOptions } from 'cookie'
import db from './db'
import { getVerificationSummary, type VerificationSummary } from './verification'

const isDatabaseUnavailable = (error: unknown): boolean => {
  return error instanceof Error && error.message === 'database_unavailable'
}

type JwtSession = {
  sub: number
  role: 'buyer' | 'seller' | 'conveyancer' | 'admin'
}

export type SessionUser = {
  id: number
  email: string
  role: JwtSession['role']
  fullName: string
  status: 'active' | 'suspended' | 'invited'
  phone: string | null
  verification: VerificationSummary
  profileImageUrl: string | null
  profileImageUpdatedAt: string | null
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

const REFRESH_COOKIE_NAME =
  process.env.SESSION_REFRESH_COOKIE_NAME?.trim() ||
  (APP_SCOPE === 'admin' ? 'admin_refresh_token' : 'refresh_token')

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

const serializeCookie = (name: string, value: string, options: SerializeOptions = {}): string => {
  return cookie.serialize(name, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    ...options,
  })
}

export const createSessionCookie = (session: JwtSession): string => {
  const token = jwt.sign(session, jwtSecret(), { expiresIn: MAX_AGE_SECONDS })
  return serializeCookie(COOKIE_NAME, token, { maxAge: MAX_AGE_SECONDS })
}

export const destroySessionCookie = (): string => serializeCookie(COOKIE_NAME, '', { maxAge: 0 })

export const createRefreshCookie = (token: string, expiresAt: string): string => {
  const expires = new Date(expiresAt)
  const maxAge = Math.max(60, Math.floor((expires.getTime() - Date.now()) / 1000))
  return serializeCookie(REFRESH_COOKIE_NAME, token, { maxAge })
}

export const destroyRefreshCookie = (): string => serializeCookie(REFRESH_COOKIE_NAME, '', { maxAge: 0 })

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

const buildProfileImageUrl = (mime: string | null, data: string | null): string | null => {
  if (!mime || !data) {
    return null
  }
  const trimmedMime = mime.trim().toLowerCase()
  if (!trimmedMime.startsWith('image/')) {
    return null
  }
  if (!data.match(/^[a-z0-9+/=]+$/i)) {
    return null
  }
  return `data:${trimmedMime};base64,${data}`
}

const mapUser = (row: any): SessionUser | null => {
  if (!row) return null
  const verification = getVerificationSummary(row.id as number)
  return {
    id: row.id as number,
    email: row.email as string,
    role: row.role as SessionUser['role'],
    fullName: row.full_name as string,
    status: (row.status as SessionUser['status']) ?? 'active',
    phone: (row.phone as string | null) ?? null,
    verification,
    profileImageUrl: buildProfileImageUrl(row.profile_image_mime as string | null, row.profile_image_data as string | null),
    profileImageUpdatedAt: (row.profile_image_updated_at as string | null) ?? null,
  }
}

export const getUserById = (id: number): SessionUser | null => {
  try {
    const stmt = db.prepare(
      `SELECT id, email, role, full_name, status, phone, profile_image_data, profile_image_mime, profile_image_updated_at
         FROM users WHERE id = ?`
    )
    return mapUser(stmt.get(id))
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      console.warn('Failed to load user by id', error)
    }
    return null
  }
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

export const getRefreshTokenFromRequest = (req: RequestWithCookies): string | null => {
  const cookiesHeader = req.headers.cookie
  if (!cookiesHeader) {
    return null
  }
  const cookies = cookie.parse(Array.isArray(cookiesHeader) ? cookiesHeader.join('; ') : cookiesHeader)
  const token = cookies[REFRESH_COOKIE_NAME]
  return token ?? null
}

export const requireRole = (
  req: RequestWithCookies,
  res: ResponseWithJson,
  roles: SessionUser['role'][]
): SessionUser | null => {
  const user = getSessionFromRequest(req)
  if (!user || !roles.includes(user.role) || user.status !== 'active') {
    res.status(403).json({ error: 'forbidden' })
    return null
  }
  return user
}

export const requireAuth = (req: RequestWithCookies, res: ResponseWithJson): SessionUser | null => {
  const user = getSessionFromRequest(req)
  if (!user || user.status !== 'active') {
    res.status(401).json({ error: 'unauthorized' })
    return null
  }
  return user
}
