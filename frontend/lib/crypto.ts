import { createDecipheriv } from 'crypto'

type DecryptOptions = {
  secretBase64: string
  payloadBase64: string
}

export const decryptJsonPayload = <T>({ secretBase64, payloadBase64 }: DecryptOptions): T | null => {
  if (!secretBase64 || !payloadBase64) {
    return null
  }

  try {
    const secret = Buffer.from(secretBase64, 'base64')
    const payload = Buffer.from(payloadBase64, 'base64')

    if (secret.length !== 32) {
      throw new Error('Invalid secret length for AES-256-GCM')
    }
    if (payload.length <= 28) {
      throw new Error('Payload too short')
    }

    const iv = payload.subarray(0, 12)
    const ciphertext = payload.subarray(12, payload.length - 16)
    const authTag = payload.subarray(payload.length - 16)

    const decipher = createDecipheriv('aes-256-gcm', secret, iv)
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return JSON.parse(decrypted.toString('utf8')) as T
  } catch (error) {
    console.error('Failed to decrypt payload', error)
    return null
  }
}
