import type { NextApiRequest, NextApiResponse } from 'next'
import db from '../../../lib/db'
import { requireAuth } from '../../../lib/session'
import { decryptBuffer } from '../../../lib/secure'
import { ensureParticipant } from '../../../lib/conversations'

const handler = (req: NextApiRequest, res: NextApiResponse): void => {
  const user = requireAuth(req, res)
  if (!user) {
    return
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    res.status(405).end('Method Not Allowed')
    return
  }

  const id = Number(req.query.id)
  if (!id || Number.isNaN(id)) {
    res.status(400).json({ error: 'invalid_file' })
    return
  }

  const file = db
    .prepare(
      'SELECT message_id, filename, mime_type, iv, auth_tag, ciphertext FROM message_files WHERE id = ?'
    )
    .get(id) as
    | { message_id: number; filename: string; mime_type: string; iv: string; auth_tag: string; ciphertext: Buffer }
    | undefined

  if (!file) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  const message = db
    .prepare('SELECT conversation_id FROM messages WHERE id = ?')
    .get(file.message_id) as { conversation_id: number } | undefined

  if (!message || !ensureParticipant(message.conversation_id, user.id)) {
    res.status(403).json({ error: 'forbidden' })
    return
  }

  const buffer = decryptBuffer({
    iv: file.iv,
    authTag: file.auth_tag,
    ciphertext: file.ciphertext,
  })

  res.setHeader('Content-Type', file.mime_type)
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`)
  res.status(200).send(buffer)
}

export default handler
