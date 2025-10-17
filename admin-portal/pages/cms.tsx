import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import { FormEvent, useEffect, useMemo, useState } from 'react'

import AdminLayout from '../components/AdminLayout'
import type { SessionUser } from '../../frontend/lib/session'
import { getSessionFromRequest } from '../../frontend/lib/session'

import type { ContentPage } from '../../frontend/lib/cms'

const emptyPage: ContentPage = {
  slug: 'about-us',
  title: '',
  body: '',
  metaDescription: '',
  updatedAt: new Date(0).toISOString(),
}

type CmsManagerProps = {
  user: SessionUser
  initialPages: ContentPage[]
}

const CmsManager = ({ user, initialPages }: CmsManagerProps): JSX.Element => {
  const [pages, setPages] = useState<ContentPage[]>(initialPages)
  const [selectedSlug, setSelectedSlug] = useState<string>(initialPages[0]?.slug ?? emptyPage.slug)
  const [formState, setFormState] = useState<ContentPage>(initialPages[0] ?? emptyPage)
  const [status, setStatus] = useState<'idle' | 'saving'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    const page = pages.find((entry) => entry.slug === selectedSlug)
    setFormState(page ?? { ...emptyPage, slug: selectedSlug })
  }, [pages, selectedSlug])

  const sortedPages = useMemo(() => pages.slice().sort((a, b) => a.slug.localeCompare(b.slug)), [pages])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (status === 'saving') {
      return
    }
    setStatus('saving')
    setError(null)
    setSuccess(null)
    try {
      const payload = {
        slug: formState.slug,
        title: formState.title,
        body: formState.body,
        metaDescription: formState.metaDescription,
      }
      const response = await fetch('/api/cms', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = (await response.json().catch(() => null)) as ContentPage | { error?: string } | null
      if (!response.ok) {
        const message =
          result && typeof result === 'object' && 'error' in result
            ? result.error === 'invalid_slug'
              ? 'Slugs may only include letters, numbers, and dashes.'
              : 'Unable to save content. Please try again.'
            : 'Unable to save content. Please try again.'
        throw new Error(message)
      }
      if (result && 'slug' in result) {
        setPages((prev) => {
          const next = prev.filter((entry) => entry.slug !== result.slug)
          next.push(result)
          return next
        })
        setSelectedSlug(result.slug)
        setSuccess('Content page updated successfully')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save content')
    } finally {
      setStatus('idle')
    }
  }

  return (
    <AdminLayout user={user}>
      <Head>
        <title>Content &amp; SEO controls</title>
      </Head>
      <section className="admin-section" aria-labelledby="cms-heading">
        <header className="admin-section__header">
          <div>
            <h1 id="cms-heading" className="admin-section__title">
              Content &amp; SEO
            </h1>
            <p className="admin-section__description">
              Manage landing page messaging and search metadata surfaced on the public marketplace.
            </p>
          </div>
        </header>
        {error ? (
          <p className="admin-error" role="alert">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="admin-success" role="status">
            {success}
          </p>
        ) : null}
        <div className="admin-form">
          <label className="admin-form__label">
            Content page
            <select
              className="admin-select"
              value={selectedSlug}
              onChange={(event) => setSelectedSlug(event.target.value)}
            >
              {sortedPages.map((page) => (
                <option key={page.slug} value={page.slug}>
                  {page.slug}
                </option>
              ))}
            </select>
          </label>
        </div>
        <form className="admin-form" onSubmit={handleSubmit}>
          <div className="admin-form__grid">
            <label className="admin-form__label">
              Title
              <input
                className="admin-input"
                value={formState.title}
                onChange={(event) => setFormState((prev) => ({ ...prev, title: event.target.value }))}
                required
              />
            </label>
            <label className="admin-form__label">
              Meta description
              <textarea
                className="admin-textarea"
                value={formState.metaDescription}
                onChange={(event) => setFormState((prev) => ({ ...prev, metaDescription: event.target.value }))}
                rows={3}
                maxLength={280}
                required
              />
            </label>
          </div>
          <label className="admin-form__label">
            Page body (Markdown supported)
            <textarea
              className="admin-textarea"
              value={formState.body}
              onChange={(event) => setFormState((prev) => ({ ...prev, body: event.target.value }))}
              rows={12}
              required
            />
          </label>
          <div className="admin-form__actions">
            <button type="submit" className="admin-button" disabled={status === 'saving'}>
              {status === 'saving' ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </section>
    </AdminLayout>
  )
}

export const getServerSideProps: GetServerSideProps<CmsManagerProps> = async ({ req }) => {
  const user = getSessionFromRequest(req)
  if (!user || user.role !== 'admin') {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    }
  }

  const { listContentPages } = await import('../../frontend/lib/cms')
  const pages = listContentPages()

  return { props: { user, initialPages: pages } }
}

export default CmsManager
