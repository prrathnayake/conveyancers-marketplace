import { recordAuditEvent } from './audit'
import db from './db'
import type { SessionUser } from './session'

export type CatalogueEntry = {
  slug: string
  title: string
  summary: string
  audience: string
  previewMarkdown: string
  features: string[]
}

type CatalogueRow = {
  slug: string
  title: string
  summary: string
  audience: string
  preview_markdown: string
  features: string
}

const parseFeatures = (payload: string): string[] => {
  try {
    const parsed = JSON.parse(payload)
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string')
    }
  } catch (error) {
    console.warn('Unable to parse catalogue feature payload', { payload, error })
  }
  return []
}

const normalizeEntry = (entry: CatalogueEntry): CatalogueEntry => ({
  slug: entry.slug.trim().toLowerCase(),
  title: entry.title.trim(),
  summary: entry.summary.trim(),
  audience: entry.audience.trim(),
  previewMarkdown: entry.previewMarkdown.trim(),
  features: entry.features.map((feature) => feature.trim()).filter((feature) => feature.length > 0),
})

export const listCatalogueEntries = (): CatalogueEntry[] => {
  const rows = db
    .prepare(
      `SELECT slug, title, summary, audience, preview_markdown, features
         FROM service_catalogue
     ORDER BY updated_at DESC`
    )
    .all() as CatalogueRow[]

  return rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    audience: row.audience,
    previewMarkdown: row.preview_markdown,
    features: parseFeatures(row.features),
  }))
}

export const saveCatalogueEntries = (entries: CatalogueEntry[], actor: SessionUser): void => {
  const normalized = entries.map(normalizeEntry)
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

  tx(normalized)

  for (const entry of normalized) {
    recordAuditEvent(actor, {
      action: 'service_catalogue.updated',
      entity: 'service_catalogue',
      entityId: entry.slug,
      metadata: { title: entry.title },
    })
  }
}
