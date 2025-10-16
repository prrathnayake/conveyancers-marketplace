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

const decodeKey = (): Buffer => {
  const secret = process.env.CHAT_ENCRYPTION_KEY
  if (!secret) {
    throw new Error('CHAT_ENCRYPTION_KEY must be configured before encrypting chat payloads')
  }
  const buffer = Buffer.from(secret, 'base64')
  if (buffer.length !== 32) {
    throw new Error('CHAT_ENCRYPTION_KEY must be a 32-byte value encoded with base64')
  }
  return buffer
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
