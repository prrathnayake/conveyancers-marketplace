import crypto from 'crypto'
import db from './db'

const TOKEN_TTL_DAYS = 30

const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex')
}

const generateToken = (): string => crypto.randomBytes(32).toString('base64url')

export const issueRefreshToken = (userId: number): { token: string; expiresAt: string } => {
  const token = generateToken()
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
  db.prepare(
    `INSERT INTO auth_refresh_tokens (user_id, token_hash, expires_at)
     VALUES (?, ?, ?)`
  ).run(userId, hashToken(token), expiresAt)
  return { token, expiresAt }
}

export const revokeRefreshToken = (token: string): void => {
  db.prepare('UPDATE auth_refresh_tokens SET revoked = 1 WHERE token_hash = ?').run(hashToken(token))
}

export const verifyRefreshToken = (
  token: string
): { userId: number; expiresAt: string; tokenHash: string } | null => {
  const tokenHash = hashToken(token)
  const row = db
    .prepare(
      `SELECT user_id AS userId, expires_at AS expiresAt, revoked FROM auth_refresh_tokens
       WHERE token_hash = ?`
    )
    .get(tokenHash) as { userId: number; expiresAt: string; revoked: number } | undefined
  if (!row) {
    return null
  }
  if (row.revoked) {
    return null
  }
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    return null
  }
  return { userId: row.userId, expiresAt: row.expiresAt, tokenHash }
}

export const rotateRefreshToken = (token: string): { token: string; expiresAt: string; userId: number } | null => {
  const verified = verifyRefreshToken(token)
  if (!verified) {
    return null
  }
  const next = issueRefreshToken(verified.userId)
  db.prepare('UPDATE auth_refresh_tokens SET revoked = 1 WHERE token_hash = ?').run(verified.tokenHash)
  return { ...next, userId: verified.userId }
}
