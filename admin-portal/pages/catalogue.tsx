import { useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import type { GetServerSideProps } from 'next'

import AdminLayout from '../components/AdminLayout'
import type { CatalogueEntry } from '../../frontend/lib/catalogue'
import type { SessionUser } from '../../frontend/lib/session'
import { getSessionFromRequest } from '../../frontend/lib/session'

type CatalogueManagerProps = {
  user: SessionUser
  initialEntries: CatalogueEntry[]
}

type DraftEntry = CatalogueEntry & { featureText: string }

const createDraft = (entry: CatalogueEntry): DraftEntry => ({
  ...entry,
  featureText: entry.features.join('\n'),
})

const emptyDraft = (slug = `draft-${Date.now()}`): DraftEntry => ({
  slug,
  title: '',
  summary: '',
  audience: '',
  previewMarkdown: '',
  features: [],
  featureText: '',
})

const CatalogueManager = ({ user, initialEntries }: CatalogueManagerProps): JSX.Element => {
  const [entries, setEntries] = useState(initialEntries.map(createDraft))
  const [activeSlug, setActiveSlug] = useState(entries[0]?.slug ?? '')
  const [draft, setDraft] = useState<DraftEntry>(entries[0] ?? emptyDraft())
  const [status, setStatus] = useState<'idle' | 'saving' | 'error' | 'success'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  useEffect(() => {
    if (!activeSlug) {
      setDraft(emptyDraft())
      return
    }
    const next = entries.find((entry) => entry.slug === activeSlug)
    if (next) {
      setDraft(next)
    }
  }, [activeSlug, entries])

  const previewFeatures = useMemo(() => {
    return draft.featureText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  }, [draft.featureText])

  const updateDraft = (patch: Partial<DraftEntry>) => {
    setDraft((current) => ({ ...current, ...patch }))
  }

  const handleSave = async () => {
    setStatus('saving')
    setErrorMessage('')
    setStatusMessage('')
    try {
      const candidateSlug = draft.slug.startsWith('draft-')
        ? draft.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
        : draft.slug
      const slug = candidateSlug.length > 0 ? candidateSlug : `service-${Date.now()}`
      const payload: CatalogueEntry = {
        slug,
        title: draft.title,
        summary: draft.summary,
        audience: draft.audience,
        previewMarkdown: draft.previewMarkdown,
        features: previewFeatures,
      }
      const response = await fetch('/api/catalogue', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: [payload] }),
      })
      if (!response.ok) {
        throw new Error('Unable to save catalogue entry')
      }
      const data = (await response.json()) as { entries: CatalogueEntry[] }
      const mapped = data.entries.map(createDraft)
      if (mapped.length === 0) {
        const fallback = emptyDraft()
        setEntries([fallback])
        setActiveSlug(fallback.slug)
        setDraft(fallback)
      } else {
        setEntries(mapped)
        const nextActive = mapped.find((entry) => entry.slug === payload.slug) ?? mapped[0]
        setActiveSlug(nextActive.slug)
        setDraft(nextActive)
      }
      setStatus('success')
      setStatusMessage('Entry saved successfully.')
      setTimeout(() => {
        setStatus('idle')
        setStatusMessage('')
      }, 2500)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error')
      setStatus('error')
    }
  }

  const handleDelete = async (slug: string) => {
    if (!slug) {
      return
    }
    const isPersisted = !slug.startsWith('draft-')
    const confirmation = isPersisted
      ? 'Delete this catalogue entry? Buyers and sellers will no longer see it.'
      : 'Discard this draft entry?'
    if (!confirm(confirmation)) {
      return
    }
    setStatus('saving')
    setErrorMessage('')
    setStatusMessage('')
    try {
      if (isPersisted) {
        const response = await fetch(`/api/catalogue?slug=${encodeURIComponent(slug)}`, { method: 'DELETE' })
        const data = (await response.json().catch(() => null)) as { entries?: CatalogueEntry[]; error?: string } | null
        if (!response.ok || !data?.entries) {
          throw new Error(data?.error ?? 'Unable to delete catalogue entry')
        }
        const mapped = data.entries.map(createDraft)
        if (mapped.length === 0) {
          const fallback = emptyDraft()
          setEntries([fallback])
          setActiveSlug(fallback.slug)
          setDraft(fallback)
        } else {
          setEntries(mapped)
          setActiveSlug(mapped[0].slug)
          setDraft(mapped[0])
        }
        setStatus('success')
        setStatusMessage('Entry deleted successfully.')
        setTimeout(() => {
          setStatus('idle')
          setStatusMessage('')
        }, 2500)
      } else {
        const remaining = entries.filter((entry) => entry.slug !== slug)
        if (remaining.length === 0) {
          const fallback = emptyDraft()
          setEntries([fallback])
          setActiveSlug(fallback.slug)
          setDraft(fallback)
        } else {
          setEntries(remaining)
          setActiveSlug(remaining[0].slug)
          setDraft(remaining[0])
        }
        setStatus('success')
        setStatusMessage('Draft entry discarded.')
        setTimeout(() => {
          setStatus('idle')
          setStatusMessage('')
        }, 1500)
      }
    } catch (error) {
      setStatus('error')
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete catalogue entry')
    }
  }

  const handleNewEntry = () => {
    const fresh = emptyDraft()
    setEntries((existing) => [...existing, fresh])
    setActiveSlug(fresh.slug)
    setDraft(fresh)
    setStatus('idle')
    setStatusMessage('')
    setErrorMessage('')
  }

  return (
    <AdminLayout user={user}>
      <Head>
        <title>Service catalog</title>
      </Head>
      <section className="admin-section">
        <header className="admin-section__header">
          <div>
            <h1 className="admin-section__title">Service catalog</h1>
            <p className="admin-section__description">
              Curate the marketplace offerings and preview the copy buyers and sellers will see.
            </p>
          </div>
          <button className="admin-button" type="button" onClick={handleNewEntry}>
            Add new entry
          </button>
        </header>
        <div className="catalogue-grid">
          <aside className="catalogue-grid__sidebar" aria-label="Catalogue entries">
            <ul className="catalogue-list">
              {entries.map((entry) => (
                <li key={entry.slug}>
                  <button
                    type="button"
                    className={`catalogue-list__item ${activeSlug === entry.slug ? 'catalogue-list__item--active' : ''}`}
                    onClick={() => setActiveSlug(entry.slug)}
                  >
                    <span className="catalogue-list__title">{entry.title || 'Untitled entry'}</span>
                    <span className="catalogue-list__subtitle">{entry.audience || 'Audience TBD'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          <div className="catalogue-grid__editor">
            <form
              className="catalogue-form"
              onSubmit={(event) => {
                event.preventDefault()
                void handleSave()
              }}
            >
              <div className="catalogue-form__group">
                <label htmlFor="title">Title</label>
                <input
                  id="title"
                  type="text"
                  value={draft.title}
                  onChange={(event) => updateDraft({ title: event.target.value })}
                  required
                />
              </div>
              <div className="catalogue-form__group">
                <label htmlFor="audience">Audience</label>
                <input
                  id="audience"
                  type="text"
                  value={draft.audience}
                  onChange={(event) => updateDraft({ audience: event.target.value })}
                />
              </div>
              <div className="catalogue-form__group">
                <label htmlFor="summary">Summary</label>
                <textarea
                  id="summary"
                  rows={3}
                  value={draft.summary}
                  onChange={(event) => updateDraft({ summary: event.target.value })}
                />
              </div>
              <div className="catalogue-form__group">
                <label htmlFor="preview">Preview copy</label>
                <textarea
                  id="preview"
                  rows={4}
                  value={draft.previewMarkdown}
                  onChange={(event) => updateDraft({ previewMarkdown: event.target.value })}
                />
              </div>
              <div className="catalogue-form__group">
                <label htmlFor="features">Feature list</label>
                <textarea
                  id="features"
                  rows={6}
                  value={draft.featureText}
                  onChange={(event) => updateDraft({ featureText: event.target.value })}
                  placeholder={'One feature per line\nEscrow tracking alerts\nAutomated title checks'}
                />
                <p className="catalogue-form__help">Each line becomes a bullet point in the customer preview.</p>
              </div>
              <div className="catalogue-form__actions">
                <button className="admin-button admin-button--primary" type="submit" disabled={status === 'saving'}>
                  {status === 'saving' ? 'Saving…' : 'Save changes'}
                </button>
                <button
                  className="admin-button admin-button--danger"
                  type="button"
                  onClick={() => void handleDelete(draft.slug)}
                  disabled={status === 'saving'}
                >
                  {draft.slug.startsWith('draft-') ? 'Discard draft' : 'Delete entry'}
                </button>
              </div>
              {status === 'error' && errorMessage ? <p className="admin-error">{errorMessage}</p> : null}
              {status === 'success' && statusMessage ? <p className="admin-success">{statusMessage}</p> : null}
            </form>
          </div>
          <aside className="catalogue-grid__preview" aria-live="polite">
            <article className="catalogue-preview">
              <header>
                <h2>{draft.title || 'Live preview'}</h2>
                <p className="catalogue-preview__audience">{draft.audience || 'Audience pending'}</p>
              </header>
              <p className="catalogue-preview__summary">{draft.summary || 'Add a summary to see it here.'}</p>
              <blockquote className="catalogue-preview__highlight">{draft.previewMarkdown || 'Marketing copy renders in this hero block.'}</blockquote>
              <ul className="catalogue-preview__features">
                {previewFeatures.length > 0 ? (
                  previewFeatures.map((feature) => <li key={feature}>{feature}</li>)
                ) : (
                  <li>Feature bullets will appear here once added.</li>
                )}
              </ul>
            </article>
          </aside>
        </div>
      </section>
    </AdminLayout>
  )
}

export const getServerSideProps: GetServerSideProps<CatalogueManagerProps> = async ({ req, res }) => {
  const user = getSessionFromRequest(req)
  if (!user || user.role !== 'admin') {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    }
  }

  const protocol = (req.headers['x-forwarded-proto'] as string) ?? 'http'
  const hostHeader = req.headers.host ?? 'localhost:5300'
  const response = await fetch(`${protocol}://${hostHeader}/api/catalogue`, {
    headers: { cookie: req.headers.cookie ?? '' },
  })
  const payload = response.ok ? ((await response.json()) as { entries: CatalogueEntry[] }) : { entries: [] }

  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate')
  return { props: { user, initialEntries: payload.entries } }
}

export default CatalogueManager
