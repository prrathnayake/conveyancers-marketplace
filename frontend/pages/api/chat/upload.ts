import type { NextApiRequest, NextApiResponse } from 'next'
import formidable, { File } from 'formidable'
import fs from 'fs'
import db from '../../../lib/db'
import { requireAuth } from '../../../lib/session'
import { encryptBuffer, encryptText } from '../../../lib/secure'
import { ensureParticipant, getOrCreateConversation } from '../../../lib/conversations'
import { assertFileIsSafe, FileScanError } from '../../../lib/fileScanning'

export const config = {
  api: {
    bodyParser: false,
  },
}

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  const user = requireAuth(req, res)
  if (!user) {
    return
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    res.status(405).end('Method Not Allowed')
    return
  }

  const form = formidable({ multiples: false, maxFileSize: 20 * 1024 * 1024 })

  const parsed = await new Promise<{ fields: formidable.Fields; files: formidable.Files }>((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) {
        reject(err)
        return
      }
      resolve({ fields, files })
    })
  }).catch((error) => {
    res.status(400).json({ error: 'invalid_form', detail: error instanceof Error ? error.message : 'unknown' })
    return null
  })

  if (!parsed) {
    return
  }

  const partnerIdRaw = parsed.fields.partnerId
  const partnerId = Array.isArray(partnerIdRaw) ? Number(partnerIdRaw[0]) : Number(partnerIdRaw)
  if (!partnerId || Number.isNaN(partnerId)) {
    res.status(400).json({ error: 'invalid_partner' })
    return
  }

  const partnerExists = db.prepare('SELECT 1 FROM users WHERE id = ?').get(partnerId)
  if (!partnerExists) {
    res.status(404).json({ error: 'partner_not_found' })
    return
  }
  const conversation = getOrCreateConversation(user.id, partnerId)
  if (!ensureParticipant(conversation.id, user.id)) {
    res.status(403).json({ error: 'forbidden' })
    return
  }

  const file = Object.values(parsed.files)[0] as File | undefined
  if (!file) {
    res.status(400).json({ error: 'missing_file' })
    return
  }

  const data = fs.readFileSync(file.filepath)
  try {
    assertFileIsSafe(data, { filename: file.originalFilename ?? null, mimeType: file.mimetype ?? null })
  } catch (error) {
    fs.unlink(file.filepath, () => {})
    if (error instanceof FileScanError) {
      res.status(400).json({ error: error.code, detail: error.message })
      return
    }
    res.status(400).json({ error: 'scan_failed' })
    return
  }
  const messagePayload = encryptText('Secure file shared')
  const insertMessage = db.prepare(
    'INSERT INTO messages (conversation_id, sender_id, iv, auth_tag, ciphertext) VALUES (?, ?, ?, ?, ?)'
  )
  const info = insertMessage.run(
    conversation.id,
    user.id,
    messagePayload.iv,
    messagePayload.authTag,
    messagePayload.ciphertext
  )
  const messageId = Number(info.lastInsertRowid)

  const fileEncrypted = encryptBuffer(data)
  db.prepare(
    'INSERT INTO message_files (message_id, filename, mime_type, iv, auth_tag, ciphertext) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    messageId,
    file.originalFilename ?? 'upload',
    file.mimetype ?? 'application/octet-stream',
    fileEncrypted.iv,
    fileEncrypted.authTag,
    fileEncrypted.ciphertext
  )

  fs.unlink(file.filepath, () => {})

  res.status(201).json({ messageId })
}

export default handler
