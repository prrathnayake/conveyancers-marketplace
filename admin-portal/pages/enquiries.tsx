import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import { FormEvent, useCallback, useEffect, useState } from 'react'

import AdminLayout from '../components/AdminLayout'
import type { SessionUser } from '../../frontend/lib/session'
import { getSessionFromRequest } from '../../frontend/lib/session'

interface EnquiryResult {
  messageId: number
  conversationId: number
  createdAt: string
  body: string
  sender: {
    id: number
    fullName: string
    email: string
    role: string
  }
  participants: Array<{
    id: number
    fullName: string
    email: string
    role: string
  }>
  attachments: Array<{ id: number; filename: string; mimeType: string }>
}

interface EnquiryPageProps {
  user: SessionUser
}

const formatDate = (value: string): string => {
  return new Date(value).toLocaleString()
}

const EnquiriesPage = ({ user }: EnquiryPageProps): JSX.Element => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<EnquiryResult[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState<number | null>(null)

  const executeSearch = useCallback(
    async (params: URLSearchParams, signal?: AbortSignal) => {
      setStatus('loading')
      setError(null)
      try {
        const response = await fetch(`/api/enquiries?${params.toString()}`, { signal })
        if (!response.ok) {
          throw new Error('search_failed')
        }
        const payload = (await response.json()) as { results: EnquiryResult[]; total: number }
        setResults(payload.results)
        setTotal(payload.total)
        setStatus('loaded')
      } catch (err) {
        if (signal?.aborted) {
          return
        }
        console.error(err)
        setError('Unable to load enquiries. Please try again.')
        setStatus('error')
      }
    },
    []
  )

  useEffect(() => {
    const controller = new AbortController()
    void executeSearch(new URLSearchParams(), controller.signal)
    return () => controller.abort()
  }, [executeSearch])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const params = new URLSearchParams()
    const trimmed = query.trim()
    if (trimmed.length > 0) {
      params.set('q', trimmed)
    }
    await executeSearch(params)
  }

  return (
    <AdminLayout user={user}>
      <Head>
        <title>Enquiry search</title>
      </Head>
      <section className="admin-section">
        <header className="admin-section__header">
          <div>
            <h1 className="admin-section__title">Enquiries</h1>
            <p className="admin-section__description">
              Search encrypted chat transcripts when regulators request a full audit trail.
            </p>
          </div>
        </header>
        <form className="admin-search__form" onSubmit={handleSubmit}>
          <label htmlFor="query" className="sr-only">
            Search conversations
          </label>
          <input
            id="query"
            name="query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="admin-search__input"
            placeholder="Search by participant or message content"
            autoComplete="off"
          />
          <button type="submit" className="admin-search__submit" disabled={status === 'loading'}>
            {status === 'loading' ? 'Searching…' : 'Search'}
          </button>
        </form>
        <div className="admin-search__meta" role="status">
          {status === 'loading' ? 'Searching secure transcripts…' : null}
          {status === 'loaded' && total !== null ? `${total} message${total === 1 ? '' : 's'} matched.` : null}
          {status === 'error' && error ? error : null}
        </div>
        <div className="admin-search__results">
          {results.map((result) => (
            <article key={result.messageId} className="admin-message-card">
              <header className="admin-message-card__header">
                <div>
                  <h2>Conversation #{result.conversationId}</h2>
                  <p className="admin-message-card__meta">
                    Sent by {result.sender.fullName} ({result.sender.role}) · {result.sender.email}
                  </p>
                </div>
                <time className="admin-message-card__timestamp" dateTime={result.createdAt}>
                  {formatDate(result.createdAt)}
                </time>
              </header>
              <p className="admin-message-card__body">{result.body}</p>
              <div className="admin-message-card__participants" aria-label="Participants">
                {result.participants.map((participant) => (
                  <span key={participant.id} className="admin-chip">
                    <span>{participant.fullName}</span>
                    <span className="admin-chip__role">{participant.role}</span>
                  </span>
                ))}
              </div>
              {result.attachments.length > 0 ? (
                <ul className="admin-message-card__attachments">
                  {result.attachments.map((attachment) => (
                    <li key={attachment.id}>
                      <a href={`/api/enquiries/files/${attachment.id}`}>{attachment.filename}</a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
        {status === 'loaded' && results.length === 0 ? (
          <p className="admin-search__empty">No enquiries matched your search.</p>
        ) : null}
      </section>
    </AdminLayout>
  )
}

export const getServerSideProps: GetServerSideProps<EnquiryPageProps> = async ({ req }) => {
  const user = getSessionFromRequest(req)
  if (!user || user.role !== 'admin') {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    }
  }
  return { props: { user } }
}

export default EnquiriesPage
