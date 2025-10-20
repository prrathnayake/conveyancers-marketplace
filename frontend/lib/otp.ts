import crypto from 'crypto'

import db from './db'
import { recomputeVerificationStatus } from './verification'

export type VerificationChannel = 'email' | 'phone'

type IssueOptions = {
  metadata?: Record<string, unknown>
}

type VerificationRecord = {
  id: number
  code_hash: string
  code_salt: string
  attempts: number
  max_attempts: number
  expires_at: string
}

const MAX_CODE_ATTEMPTS = 5
const OTP_EXPIRY_MINUTES = 10
const MIN_RESEND_INTERVAL_SECONDS = 60

const hashCode = (code: string, salt: string): string => {
  return crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex')
}

const generateCode = (): string => {
  const randomBytes = crypto.randomBytes(4)
  const numeric = randomBytes.readUInt32BE() % 1_000_000
  return numeric.toString().padStart(6, '0')
}

const pruneExpired = (userId: number, channel: VerificationChannel) => {
  db.prepare(
    `DELETE FROM user_verification_codes
      WHERE user_id = ? AND channel = ? AND expires_at <= NOW()`
  ).run(userId, channel)
}

export type IssuedCode = {
  code: string
  expiresAt: string
  developmentCode?: string
}

export const issueVerificationCode = (userId: number, channel: VerificationChannel, options: IssueOptions = {}): IssuedCode => {
  pruneExpired(userId, channel)

  const recent = db
    .prepare(
      `SELECT created_at FROM user_verification_codes
         WHERE user_id = ? AND channel = ?
     ORDER BY created_at DESC
        LIMIT 1`
    )
    .get(userId, channel) as { created_at: string } | undefined

  if (recent) {
    const createdAt = new Date(`${recent.created_at}Z`)
    const secondsSince = Math.floor((Date.now() - createdAt.getTime()) / 1000)
    if (secondsSince < MIN_RESEND_INTERVAL_SECONDS) {
      throw new Error('rate_limited')
    }
  }

  const salt = crypto.randomBytes(16).toString('hex')
  const code = generateCode()
  const codeHash = hashCode(code, salt)
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)

  const metadata = options.metadata ? JSON.stringify(options.metadata) : '{}'

  const stmt = db.prepare(
    `INSERT INTO user_verification_codes (user_id, channel, code_hash, code_salt, metadata, attempts, max_attempts, expires_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
  )
  stmt.run(userId, channel, codeHash, salt, metadata, MAX_CODE_ATTEMPTS, expiresAt.toISOString())

  const payload: IssuedCode = { code, expiresAt: expiresAt.toISOString() }
  if (process.env.NODE_ENV !== 'production') {
    payload.developmentCode = code
  }
  return payload
}

export type VerifyResult =
  | { ok: true; verifiedAt: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'too_many_attempts' | 'not_found' }

const fetchActiveRecord = (userId: number, channel: VerificationChannel): VerificationRecord | null => {
  const row = db
    .prepare(
      `SELECT id, code_hash, code_salt, attempts, max_attempts, expires_at
         FROM user_verification_codes
        WHERE user_id = ? AND channel = ?
     ORDER BY created_at DESC
        LIMIT 1`
    )
    .get(userId, channel) as VerificationRecord | undefined
  return row ?? null
}

export const verifyCode = (userId: number, channel: VerificationChannel, code: string): VerifyResult => {
  pruneExpired(userId, channel)
  const record = fetchActiveRecord(userId, channel)
  if (!record) {
    return { ok: false, reason: 'not_found' }
  }
  if (record.attempts >= record.max_attempts) {
    return { ok: false, reason: 'too_many_attempts' }
  }

  const expiresAt = new Date(`${record.expires_at}Z`)
  if (expiresAt.getTime() <= Date.now()) {
    db.prepare('DELETE FROM user_verification_codes WHERE id = ?').run(record.id)
    return { ok: false, reason: 'expired' }
  }

  const expected = hashCode(code, record.code_salt)
  if (expected !== record.code_hash) {
    db.prepare('UPDATE user_verification_codes SET attempts = attempts + 1 WHERE id = ?').run(record.id)
    return { ok: false, reason: 'invalid' }
  }

  db.prepare('DELETE FROM user_verification_codes WHERE id = ?').run(record.id)
  const timestamp = new Date().toISOString()

  if (channel === 'email') {
    db.prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP) WHERE id = ?').run(userId)
  } else {
    db.prepare('UPDATE users SET phone_verified_at = COALESCE(phone_verified_at, CURRENT_TIMESTAMP) WHERE id = ?').run(userId)
  }
  recomputeVerificationStatus(userId)
  return { ok: true, verifiedAt: timestamp }
}

export const clearCodesForChannel = (userId: number, channel: VerificationChannel): void => {
  db.prepare('DELETE FROM user_verification_codes WHERE user_id = ? AND channel = ?').run(userId, channel)
}
