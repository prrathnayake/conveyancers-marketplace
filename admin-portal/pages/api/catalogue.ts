import type { NextApiRequest, NextApiResponse } from 'next'

import { recordAuditEvent } from '../../../frontend/lib/audit'
import db from '../../../frontend/lib/db'
import type { SessionUser } from '../../../frontend/lib/session'
import { requireRole } from '../../../frontend/lib/session'

export type CatalogueEntry = {
  slug: string
  title: string
  summary: string
  audience: string
  previewMarkdown: string
  features: string[]
}

type CatalogueResponse = {
  entries: CatalogueEntry[]
}

const deserializeFeatures = (payload: string): string[] => {
  try {
    const parsed = JSON.parse(payload)
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string')
    }
  } catch {
    // ignore parse issues and return empty array
  }
  return []
}

const listCatalogue = (): CatalogueEntry[] => {
  const rows = db
    .prepare(
      `SELECT slug, title, summary, audience, preview_markdown, features
         FROM service_catalogue
     ORDER BY updated_at DESC`
    )
    .all() as Array<{
    slug: string
    title: string
    summary: string
    audience: string
    preview_markdown: string
    features: string
  }>

  return rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    audience: row.audience,
    previewMarkdown: row.preview_markdown,
    features: deserializeFeatures(row.features),
  }))
}

const upsertCatalogue = (entries: CatalogueEntry[], actor: SessionUser) => {
  const statement = db.prepare(
    `INSERT INTO service_catalogue (slug, title, summary, audience, preview_markdown, features, updated_at)
     VALUES (@slug, @title, @summary, @audience, @preview_markdown, @features, CURRENT_TIMESTAMP)
     ON CONFLICT(slug) DO UPDATE SET
       title = excluded.title,
       summary = excluded.summary,
       audience = excluded.audience,
       preview_markdown = excluded.preview_markdown,
       features = excluded.features,
       updated_at = CURRENT_TIMESTAMP`
  )

  const tx = db.transaction((records: CatalogueEntry[]) => {
    for (const entry of records) {
      statement.run({
        slug: entry.slug,
        title: entry.title,
        summary: entry.summary,
        audience: entry.audience,
        preview_markdown: entry.previewMarkdown,
        features: JSON.stringify(entry.features),
      })
    }
  })

  tx(entries)

  for (const entry of entries) {
    recordAuditEvent(actor, {
      action: 'service_catalogue.updated',
      entity: 'service_catalogue',
      entityId: entry.slug,
      metadata: { title: entry.title },
    })
  }
}

const handler = (req: NextApiRequest, res: NextApiResponse<CatalogueResponse | { error: string }>): void => {
  const user = requireRole(req, res, ['admin'])
  if (!user) {
    return
  }

  if (req.method === 'GET') {
    const entries = listCatalogue()
    res.status(200).json({ entries })
    return
  }

  if (req.method === 'PUT') {
    const { entries } = req.body as { entries?: CatalogueEntry[] }
    if (!entries || !Array.isArray(entries)) {
      res.status(400).json({ error: 'missing_entries' })
      return
    }

    const sanitized = entries.map((entry) => ({
      slug: entry.slug.trim().toLowerCase(),
      title: entry.title.trim(),
      summary: entry.summary.trim(),
      audience: entry.audience.trim(),
      previewMarkdown: entry.previewMarkdown.trim(),
      features: entry.features.map((feature) => feature.trim()).filter((feature) => feature.length > 0),
    }))

    upsertCatalogue(sanitized, user)

    res.status(200).json({ entries: listCatalogue() })
    return
  }

  res.setHeader('Allow', ['GET', 'PUT'])
  res.status(405).json({ error: 'method_not_allowed' })
}

export default handler
