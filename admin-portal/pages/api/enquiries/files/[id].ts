import type { NextApiRequest, NextApiResponse } from 'next'

import db from '@frontend/lib/db'
import { requireRole } from '@frontend/lib/session'
import { decryptBuffer } from '@frontend/lib/secure'

const handler = (req: NextApiRequest, res: NextApiResponse): void => {
  const user = requireRole(req, res, ['admin'])
  if (!user) {
    return
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const idParam = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id
  const id = Number(idParam)
  if (!id || Number.isNaN(id)) {
    res.status(400).json({ error: 'invalid_file' })
    return
  }

  const record = db
    .prepare('SELECT filename, mime_type, iv, auth_tag, ciphertext FROM message_files WHERE id = ?')
    .get(id) as
    | { filename: string; mime_type: string; iv: string; auth_tag: string; ciphertext: Buffer }
    | undefined

  if (!record) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  const payload = decryptBuffer({
    iv: record.iv,
    authTag: record.auth_tag,
    ciphertext: record.ciphertext,
  })

  res.setHeader('Content-Type', record.mime_type)
  res.setHeader('Content-Disposition', `attachment; filename="${record.filename}"`)
  res.status(200).send(payload)
}

export default handler
