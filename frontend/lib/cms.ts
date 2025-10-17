import db, { ensureSeedData } from './db'

export type ContentPage = {
  slug: string
  title: string
  body: string
  metaDescription: string
  updatedAt: string
}

type ContentRow = {
  slug: string
  title: string
  body: string
  meta_description: string
  updated_at: string
}

const mapRow = (row: ContentRow | undefined): ContentPage | null => {
  if (!row) {
    return null
  }
  return {
    slug: row.slug,
    title: row.title,
    body: row.body,
    metaDescription: row.meta_description,
    updatedAt: row.updated_at,
  }
}

export const listContentPages = (): ContentPage[] => {
  ensureSeedData()
  const rows = db
    .prepare('SELECT slug, title, body, meta_description, updated_at FROM content_pages ORDER BY slug ASC')
    .all() as ContentRow[]
  return rows.map((row) => mapRow(row)!)
}

export const getContentPage = (slug: string): ContentPage | null => {
  ensureSeedData()
  const stmt = db.prepare(
    'SELECT slug, title, body, meta_description, updated_at FROM content_pages WHERE slug = ? LIMIT 1'
  )
  return mapRow(stmt.get(slug) as ContentRow | undefined)
}

export const saveContentPage = (page: {
  slug: string
  title: string
  body: string
  metaDescription: string
}): ContentPage => {
  ensureSeedData()
  const payload = {
    slug: page.slug.trim(),
    title: page.title.trim(),
    body: page.body.trim(),
    meta_description: page.metaDescription.trim(),
  }
  db.prepare(
    `INSERT INTO content_pages (slug, title, body, meta_description)
     VALUES (@slug, @title, @body, @meta_description)
     ON CONFLICT(slug) DO UPDATE SET
       title = excluded.title,
       body = excluded.body,
       meta_description = excluded.meta_description,
       updated_at = CURRENT_TIMESTAMP`
  ).run(payload)
  return getContentPage(payload.slug) as ContentPage
}

export default getContentPage
