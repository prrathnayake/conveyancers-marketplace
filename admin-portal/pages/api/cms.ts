import type { NextApiRequest, NextApiResponse } from 'next'

import { recordAuditEvent } from '../../../frontend/lib/audit'
import { listContentPages, saveContentPage } from '../../../frontend/lib/cms'
import { requireRole } from '../../../frontend/lib/session'
import { logServerError, serializeError } from '../../../frontend/lib/serverLogger'

const handler = (req: NextApiRequest, res: NextApiResponse) => {
  const actor = requireRole(req, res, ['admin'])
  if (!actor) {
    return
  }

  try {
    if (req.method === 'GET') {
      const pages = listContentPages()
      res.status(200).json(pages)
      return
    }

    if (req.method === 'PUT') {
      const { slug, title, body, metaDescription } = req.body as Partial<{
        slug: string
        title: string
        body: string
        metaDescription: string
      }>

      if (!slug || !title || !body || !metaDescription) {
        res.status(400).json({ error: 'invalid_payload' })
        return
      }

      if (!/^[-a-z0-9]+$/i.test(slug)) {
        res.status(400).json({ error: 'invalid_slug' })
        return
      }

      const updated = saveContentPage({ slug, title, body, metaDescription })
      recordAuditEvent(actor, {
        action: 'update',
        entity: 'content_page',
        entityId: slug,
        metadata: { title: updated.title },
      })
      res.status(200).json(updated)
      return
    }

    res.setHeader('Allow', ['GET', 'PUT'])
    res.status(405).end('Method Not Allowed')
  } catch (error) {
    logServerError('Failed to manage CMS content', {
      error: serializeError(error),
      method: req.method,
      path: '/api/cms',
    })
    res.status(500).json({ error: 'internal_error' })
  }
}

export default handler
