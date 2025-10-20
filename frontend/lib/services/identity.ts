import bcrypt from 'bcryptjs'
import type { IncomingHttpHeaders } from 'http'

import db from '../db'
import { ensureAdminSeeded } from '../adminSeed'
import { issueRefreshToken } from '../authTokens'
import { normalizePhoneNumber } from '../phone'
import { recomputeVerificationStatus } from '../verification'
import { issueVerificationCode, verifyCode } from '../otp'
import { sendEmail, sendSms } from '../notifications'
import { createSessionCookie, createRefreshCookie, type SessionUser } from '../session'
import { logServerError, serializeError } from '../serverLogger'

const resolveGatewayUrl = (): string | null => {
  const explicit = process.env.IDENTITY_SERVICE_URL ?? process.env.GATEWAY_BASE_URL
  if (explicit && explicit.trim().length > 0) {
    return explicit.trim().replace(/\/$/, '')
  }
  return null
}

const identityFetch = async <T>(path: string, init: RequestInit & { headers?: Record<string, string> } = {}): Promise<T | null> => {
  const baseUrl = resolveGatewayUrl()
  if (!baseUrl) {
    return null
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Identity request failed: ${response.status} ${text}`)
  }

  return (await response.json()) as T
}

type LoginPayload = { email: string; password: string }

type LoginResult = {
  cookies: string[]
  expiresAt: string | null
  verification?: ReturnType<typeof recomputeVerificationStatus>
  verificationRequired?: boolean
}

export const login = async (payload: LoginPayload): Promise<LoginResult> => {
  const remote = await identityFetch<LoginResult>('/identity/v1/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  }).catch((error) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Identity login request failed, falling back to local auth', error)
    }
    return null
  })

  if (remote) {
    return remote
  }

  const { email, password } = payload
  ensureAdminSeeded()

  const stmt = db.prepare(
    'SELECT id, password_hash, role, status FROM users WHERE email = ?'
  )
  const user = stmt.get(email.trim().toLowerCase()) as
    | { id: number; password_hash: string; role: SessionUser['role']; status: string }
    | undefined

  if (!user) {
    throw Object.assign(new Error('invalid_credentials'), { code: 'invalid_credentials' })
  }

  if (user.status !== 'active') {
    throw Object.assign(new Error('account_inactive'), { code: 'account_inactive' })
  }

  const valid = bcrypt.compareSync(password, user.password_hash)
  if (!valid) {
    throw Object.assign(new Error('invalid_credentials'), { code: 'invalid_credentials' })
  }

  const { token: refreshToken, expiresAt } = issueRefreshToken(user.id)
  const sessionCookie = createSessionCookie({ sub: user.id, role: user.role })
  const refreshCookie = createRefreshCookie(refreshToken, expiresAt)

  db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id)
  const verification = recomputeVerificationStatus(user.id)

  return {
    cookies: [sessionCookie, refreshCookie],
    expiresAt,
    verification,
    verificationRequired: !verification.overallVerified,
  }
}

type AdminLoginResult = {
  cookies: string[]
}

export const adminLogin = async (payload: LoginPayload): Promise<AdminLoginResult> => {
  const remote = await identityFetch<AdminLoginResult>('/identity/v1/admin/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  }).catch((error) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Identity admin login request failed, falling back to local auth', error)
    }
    return null
  })

  if (remote) {
    return remote
  }

  const { email, password } = payload
  ensureAdminSeeded()

  const stmt = db.prepare(
    'SELECT id, password_hash, role, status FROM users WHERE email = ?'
  )
  const user = stmt.get(email.trim().toLowerCase()) as
    | { id: number; password_hash: string; role: SessionUser['role']; status: string }
    | undefined

  if (!user) {
    throw Object.assign(new Error('invalid_credentials'), { code: 'invalid_credentials' })
  }

  if (user.status !== 'active') {
    throw Object.assign(new Error('account_inactive'), { code: 'account_inactive' })
  }

  const valid = bcrypt.compareSync(password, user.password_hash)
  if (!valid) {
    throw Object.assign(new Error('invalid_credentials'), { code: 'invalid_credentials' })
  }

  const cookie = createSessionCookie({ sub: user.id, role: user.role })
  db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id)

  return { cookies: [cookie] }
}

type SignupPayload = {
  email: string
  password: string
  role: string
  fullName: string
  phone: string
}

type SignupResult = {
  cookies: string[]
  verification: ReturnType<typeof recomputeVerificationStatus>
  debugCodes?: { email: string | null; phone: string | null }
}

export const signup = async (payload: SignupPayload): Promise<SignupResult> => {
  const remote = await identityFetch<SignupResult>('/identity/v1/signup', {
    method: 'POST',
    body: JSON.stringify(payload),
  }).catch((error) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Identity signup request failed, falling back to local registration', error)
    }
    return null
  })

  if (remote) {
    return remote
  }

  ensureAdminSeeded()

  const { email, password, role, fullName, phone } = payload

  const trimmedEmail = email.trim().toLowerCase()
  const trimmedRole = role.trim().toLowerCase()

  const allowedRoles = new Set<SessionUser['role']>(['buyer', 'seller', 'conveyancer'])
  if (!allowedRoles.has(trimmedRole as SessionUser['role'])) {
    throw Object.assign(new Error('invalid_role'), { code: 'invalid_role' })
  }

  if (password.length < 8) {
    throw Object.assign(new Error('weak_password'), { code: 'weak_password' })
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(trimmedEmail)
  if (existing) {
    throw Object.assign(new Error('email_in_use'), { code: 'email_in_use' })
  }

  const normalizedPhone = normalizePhoneNumber(phone)
  if (!normalizedPhone) {
    throw Object.assign(new Error('invalid_phone'), { code: 'invalid_phone' })
  }

  const passwordHash = bcrypt.hashSync(password, 12)
  const insert = db.prepare(
    'INSERT INTO users (email, password_hash, role, full_name, phone) VALUES (?, ?, ?, ?, ?)'
  )
  const info = insert.run(trimmedEmail, passwordHash, trimmedRole, fullName.trim(), normalizedPhone)
  const userId = Number(info.lastInsertRowid)

  if (trimmedRole === 'conveyancer') {
    db.prepare(
      'INSERT INTO conveyancer_profiles (user_id, firm_name, bio, phone, state, website) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userId, '', '', '', '', '')
  }

  const sessionCookie = createSessionCookie({
    sub: userId,
    role: trimmedRole as SessionUser['role'],
  })

  const emailCode = issueVerificationCode(userId, 'email', { metadata: { email: trimmedEmail } })
  const phoneCode = issueVerificationCode(userId, 'phone', { metadata: { phone: normalizedPhone } })

  await Promise.allSettled([
    sendEmail({
      to: trimmedEmail,
      subject: 'Verify your Conveyancers Marketplace account',
      html: `
        <p>Hi ${fullName.trim()},</p>
        <p>Welcome to Conveyancers Marketplace. Use the verification code <strong>${emailCode.code}</strong> within the next 10 minutes to confirm your email address.</p>
        <p>If you didn't create this account, you can ignore this message.</p>
      `,
    }),
    sendSms({
      to: normalizedPhone,
      body: `Welcome to Conveyancers Marketplace. Your verification code is ${phoneCode.code}. It expires in 10 minutes.`,
    }),
  ])

  const verification = recomputeVerificationStatus(userId)

  const result: SignupResult = {
    cookies: [sessionCookie],
    verification,
  }

  if (process.env.NODE_ENV !== 'production') {
    result.debugCodes = {
      email: emailCode.developmentCode,
      phone: phoneCode.developmentCode,
    }
  }

  return result
}

type SessionLookupOptions = {
  headers: IncomingHttpHeaders
}

type SessionResponse = {
  authenticated: boolean
  user: SessionUser | null
}

export const fetchSession = async (options: SessionLookupOptions): Promise<SessionResponse> => {
  const cookiesHeader = options.headers.cookie
  const remote = await identityFetch<SessionResponse>('/identity/v1/session', {
    method: 'GET',
    headers: cookiesHeader ? { cookie: Array.isArray(cookiesHeader) ? cookiesHeader.join('; ') : cookiesHeader } : {},
  }).catch((error) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Identity session request failed, falling back to local session lookup', error)
    }
    return null
  })

  if (remote) {
    return remote
  }

  const { getSessionFromRequest } = await import('../session')
  const user = getSessionFromRequest(options as { headers: IncomingHttpHeaders & { cookie?: string | string[] } })
  return { authenticated: Boolean(user), user }
}

type VerificationRequest = {
  user: SessionUser
  channel: 'email' | 'phone'
  phoneOverride?: string
}

type VerificationResponse = {
  ok: boolean
  expiresAt: string
  verification: ReturnType<typeof recomputeVerificationStatus>
  debugCode?: string | null
}

export const requestVerification = async ({
  user,
  channel,
  phoneOverride,
}: VerificationRequest): Promise<VerificationResponse> => {
  const remote = await identityFetch<VerificationResponse>('/identity/v1/verification/request', {
    method: 'POST',
    body: JSON.stringify({ userId: user.id, channel, phone: phoneOverride }),
  }).catch((error) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Identity verification request failed, falling back to local OTP issuance', error)
    }
    return null
  })

  if (remote) {
    return remote
  }

  let phone = user.phone ?? null
  if (channel === 'phone' && typeof phoneOverride === 'string' && phoneOverride.trim().length > 0) {
    const normalized = normalizePhoneNumber(phoneOverride)
    if (!normalized) {
      throw Object.assign(new Error('invalid_phone'), { code: 'invalid_phone' })
    }
    db.prepare('UPDATE users SET phone = ?, phone_verified_at = NULL WHERE id = ?').run(normalized, user.id)
    phone = normalized
  }

  const metadata: Record<string, unknown> =
    channel === 'email' ? { email: user.email } : phone ? { phone } : {}
  const issuance = issueVerificationCode(user.id, channel, { metadata })
  const expires = new Date(issuance.expiresAt)
  const expiryMinutes = Number.isNaN(expires.getTime())
    ? 10
    : Math.max(1, Math.round((expires.getTime() - Date.now()) / (60 * 1000)))

  if (channel === 'email') {
    await sendEmail({
      to: user.email,
      subject: 'Verify your Conveyancers Marketplace account',
      html: `
        <p>Hi ${user.fullName},</p>
        <p>Your verification code is <strong>${issuance.code}</strong>. Enter this code within the next ${expiryMinutes} minutes to confirm your email address.</p>
        <p>If you did not request this, you can ignore this email.</p>
      `,
    })
  } else if (phone) {
    await sendSms({
      to: phone,
      body: `Conveyancers Marketplace code: ${issuance.code}. It expires in ${expiryMinutes} minutes.`,
    })
  }

  const verification = recomputeVerificationStatus(user.id)

  return {
    ok: true,
    expiresAt: issuance.expiresAt,
    verification,
    debugCode: process.env.NODE_ENV !== 'production' ? issuance.developmentCode : null,
  }
}

export const recordVerificationEvent = async (
  params: { userId: number; channel: 'email' | 'phone' | 'conveyancing'; code?: string; metadata?: Record<string, unknown> }
): Promise<{ ok: boolean; verification: ReturnType<typeof recomputeVerificationStatus> }> => {
  const remote = await identityFetch<{ ok: boolean; verification: ReturnType<typeof recomputeVerificationStatus> }>(
    '/identity/v1/verification/confirm',
    {
      method: 'POST',
      body: JSON.stringify(params),
    }
  ).catch((error) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Identity verification confirm request failed, falling back to local recompute', error)
    }
    return null
  })

  if (remote) {
    return remote
  }

  let verification: ReturnType<typeof recomputeVerificationStatus>
  if (params.channel === 'conveyancing') {
    const details = params.metadata ?? {}
    const status = typeof details.status === 'string' ? details.status : 'pending'
    const reference = typeof details.reference === 'string' ? details.reference : ''
    const reason = typeof details.reason === 'string' ? details.reason : ''
    const approved = typeof details.approved === 'boolean' ? details.approved : status === 'verified'
    const timestamp = approved ? new Date().toISOString() : null

    db.prepare(
      `UPDATE conveyancer_profiles
          SET gov_status = ?,
              gov_check_reference = ?,
              gov_verified_at = ?,
              gov_denial_reason = ?
        WHERE user_id = ?`
    ).run(status, reference, timestamp, approved ? '' : reason, params.userId)
    verification = recomputeVerificationStatus(params.userId)
  } else {
    if (!params.code) {
      throw Object.assign(new Error('missing_code'), { code: 'missing_code' })
    }
    const normalized = params.code.trim()
    const result = verifyCode(params.userId, params.channel, normalized)
    if (!result.ok) {
      throw Object.assign(new Error(result.reason ?? 'verification_failed'), { code: result.reason ?? 'verification_failed' })
    }
    verification = recomputeVerificationStatus(params.userId)
  }

  return { ok: true, verification }
}

export const reportIdentityError = (context: string, error: unknown, metadata: Record<string, unknown>): void => {
  logServerError(context, {
    error: serializeError(error),
    ...metadata,
  })
}
