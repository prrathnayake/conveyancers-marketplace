import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

type EncryptedPayload = {
  iv: string
  authTag: string
  ciphertext: string
}

type BufferPayload = {
  iv: string
  authTag: string
  ciphertext: Buffer
}

let generatedKey: Buffer | null = null

const decodeKey = (): Buffer => {
  const secret = process.env.CHAT_ENCRYPTION_KEY?.trim()
  if (secret && secret.length > 0) {
    const normalized = secret.replace(/\s+/g, '')

    // First, attempt to interpret the secret as base64.
    const base64Buffer = Buffer.from(normalized, 'base64')
    const base64Normalized = base64Buffer.toString('base64').replace(/=+$/, '')
    if (base64Buffer.length === 32 && base64Normalized === normalized.replace(/=+$/, '')) {
      return base64Buffer
    }

    // Fall back to accepting 64 character hex-encoded keys which are
    // frequently used by existing infrastructure secrets tooling.
    if (/^[0-9a-fA-F]{64}$/.test(normalized)) {
      const hexBuffer = Buffer.from(normalized, 'hex')
      if (hexBuffer.length === 32) {
        return hexBuffer
      }
    }

    throw new Error(
      'CHAT_ENCRYPTION_KEY must be a 32-byte secret encoded as base64 or a 64-character hex string'
    )
  }

  if (process.env.NODE_ENV !== 'production') {
    if (!generatedKey) {
      generatedKey = randomBytes(32)
      console.warn(
        'CHAT_ENCRYPTION_KEY is not set. Generated ephemeral key for development use only. Chats will be reset on restart.'
      )
    }
    return generatedKey
  }

  throw new Error('CHAT_ENCRYPTION_KEY must be configured before encrypting chat payloads')
}

export const encryptText = (plaintext: string): EncryptedPayload => {
  const key = decodeKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return {
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: encrypted.toString('base64'),
  }
}

export const decryptText = ({ iv, authTag, ciphertext }: EncryptedPayload): string => {
  const key = decodeKey()
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(authTag, 'base64'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

export const encryptBuffer = (payload: Buffer): BufferPayload => {
  const key = decodeKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()])
  const authTag = cipher.getAuthTag()
  return {
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: encrypted,
  }
}

export const decryptBuffer = ({ iv, authTag, ciphertext }: BufferPayload): Buffer => {
  const key = decodeKey()
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(authTag, 'base64'))
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}
