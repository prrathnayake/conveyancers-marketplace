import type { NextApiRequest, NextApiResponse } from 'next'

import db from '../../../lib/db'
import { requireAuth } from '../../../lib/session'

const MAX_IMAGE_BYTES = 512 * 1024

const buildDataUrl = (mime: string | null, data: string | null): string | null => {
  if (!mime || !data) {
    return null
  }
  return `data:${mime};base64,${data}`
}

const handler = (req: NextApiRequest, res: NextApiResponse): void => {
  const user = requireAuth(req, res)
  if (!user) {
    return
  }

  if (req.method === 'GET') {
    const row = db
      .prepare('SELECT profile_image_mime, profile_image_data, profile_image_updated_at FROM users WHERE id = ?')
      .get(user.id) as { profile_image_mime: string | null; profile_image_data: string | null; profile_image_updated_at: string | null }
    const image = buildDataUrl(row?.profile_image_mime ?? null, row?.profile_image_data ?? null)
    res.status(200).json({ image, updatedAt: row?.profile_image_updated_at ?? null })
    return
  }

  if (req.method === 'POST') {
    const { image } = req.body as { image?: string }
    if (!image || typeof image !== 'string') {
      res.status(400).json({ error: 'missing_image' })
      return
    }
    const match = image.match(/^data:image\/(png|jpeg|jpg|webp);base64,([a-z0-9+/=]+)$/i)
    if (!match) {
      res.status(400).json({ error: 'invalid_format' })
      return
    }
    const mime = `image/${match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase()}`
    const data = match[2]
    const buffer = Buffer.from(data, 'base64')
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
      res.status(400).json({ error: 'image_too_large' })
      return
    }
    db.prepare(
      `UPDATE users
          SET profile_image_mime = ?,
              profile_image_data = ?,
              profile_image_updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`
    ).run(mime, data, user.id)
    res.status(200).json({ ok: true, image })
    return
  }

  if (req.method === 'DELETE') {
    db.prepare(
      `UPDATE users
          SET profile_image_mime = '',
              profile_image_data = '',
              profile_image_updated_at = NULL
        WHERE id = ?`
    ).run(user.id)
    res.status(200).json({ ok: true })
    return
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE'])
  res.status(405).end('Method Not Allowed')
}

export default handler
