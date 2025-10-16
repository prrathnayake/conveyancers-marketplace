import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import { FormEvent, useEffect, useState } from 'react'

import AdminLayout from '../../components/AdminLayout'
import type { SessionUser } from '../../lib/session'
import { getSessionFromRequest } from '../../lib/session'

type Review = {
  id: number
  conveyancer_id: number
  reviewer_name: string
  rating: number
  comment: string
  created_at: string
}

type AdminReviewsProps = {
  user: SessionUser
}

const AdminReviews = ({ user }: AdminReviewsProps): JSX.Element => {
  const [records, setRecords] = useState<Review[]>([])
  const [formState, setFormState] = useState({ conveyancerId: '', reviewerName: '', rating: 5, comment: '' })
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving'>('idle')

  const loadRecords = async () => {
    setStatus('loading')
    try {
      const response = await fetch('/api/admin/reviews')
      if (!response.ok) {
        throw new Error('load_failed')
      }
      const payload = (await response.json()) as { reviews: Review[] }
      setRecords(payload.reviews)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error')
    } finally {
      setStatus('idle')
    }
  }

  useEffect(() => {
    void loadRecords()
  }, [])

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this review?')) {
      return
    }
    setStatus('loading')
    setError(null)
    try {
      const response = await fetch(`/api/admin/reviews?id=${id}`, { method: 'DELETE' })
      if (!response.ok) {
        throw new Error('delete_failed')
      }
      await loadRecords()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error')
    } finally {
      setStatus('idle')
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatus('saving')
    setError(null)
    try {
      const response = await fetch('/api/admin/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conveyancerId: Number(formState.conveyancerId),
          reviewerName: formState.reviewerName,
          rating: Number(formState.rating),
          comment: formState.comment,
        }),
      })
      if (!response.ok) {
        throw new Error('create_failed')
      }
      setFormState({ conveyancerId: '', reviewerName: '', rating: 5, comment: '' })
      await loadRecords()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error')
    } finally {
      setStatus('idle')
    }
  }

  return (
    <AdminLayout>
      <Head>
        <title>Manage reviews</title>
      </Head>
      <section className="admin-section">
        <header className="section-header">
          <div>
            <h1>Reviews moderation</h1>
            <p>Ensure testimonials comply with advertising guidelines.</p>
          </div>
        </header>
        {error ? <p className="error">{error}</p> : null}
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Conveyancer</th>
                <th>Reviewer</th>
                <th>Rating</th>
                <th>Comment</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((review) => (
                <tr key={review.id}>
                  <td>{review.id}</td>
                  <td>#{review.conveyancer_id}</td>
                  <td>{review.reviewer_name}</td>
                  <td>{review.rating}</td>
                  <td>{review.comment}</td>
                  <td>{new Date(review.created_at).toLocaleString()}</td>
                  <td>
                    <button type="button" onClick={() => handleDelete(review.id)} className="danger">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form className="editor" onSubmit={handleSubmit}>
          <h2>Publish review</h2>
          <label>
            Conveyancer ID
            <input
              value={formState.conveyancerId}
              onChange={(event) => setFormState((prev) => ({ ...prev, conveyancerId: event.target.value }))}
              type="number"
              min={1}
              required
            />
          </label>
          <label>
            Reviewer name
            <input
              value={formState.reviewerName}
              onChange={(event) => setFormState((prev) => ({ ...prev, reviewerName: event.target.value }))}
              required
            />
          </label>
          <label>
            Rating
            <input
              value={formState.rating}
              onChange={(event) => setFormState((prev) => ({ ...prev, rating: Number(event.target.value) }))}
              type="number"
              min={1}
              max={5}
              required
            />
          </label>
          <label>
            Comment
            <textarea
              value={formState.comment}
              onChange={(event) => setFormState((prev) => ({ ...prev, comment: event.target.value }))}
              rows={3}
              required
            />
          </label>
          <button type="submit" disabled={status === 'saving'}>
            {status === 'saving' ? 'Publishing…' : 'Publish review'}
          </button>
        </form>
      </section>
      <style jsx>{`
        .admin-section {
          display: grid;
          gap: 2rem;
          color: #e2e8f0;
        }

        h1 {
          margin: 0;
          font-size: 2.2rem;
        }

        .error {
          color: #fecaca;
          background: rgba(248, 113, 113, 0.12);
          padding: 0.75rem 1rem;
          border-radius: 12px;
        }

        .table-wrapper {
          overflow-x: auto;
          border-radius: 18px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: rgba(15, 23, 42, 0.55);
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        th,
        td {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid rgba(148, 163, 184, 0.12);
          text-align: left;
        }

        button.danger {
          border: none;
          border-radius: 10px;
          padding: 0.4rem 0.9rem;
          background: rgba(248, 113, 113, 0.18);
          color: #fecaca;
          cursor: pointer;
        }

        .editor {
          display: grid;
          gap: 1rem;
          background: rgba(15, 23, 42, 0.6);
          border-radius: 18px;
          padding: 1.75rem;
          border: 1px solid rgba(148, 163, 184, 0.18);
        }

        label {
          display: grid;
          gap: 0.35rem;
          font-size: 0.9rem;
          color: rgba(148, 163, 184, 0.9);
        }

        input,
        textarea {
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: rgba(15, 23, 42, 0.5);
          padding: 0.75rem 1rem;
          color: #f8fafc;
        }

        button[type='submit'] {
          width: fit-content;
          padding: 0.75rem 1.5rem;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          color: #f8fafc;
          font-weight: 600;
        }
      `}</style>
    </AdminLayout>
  )
}

export const getServerSideProps: GetServerSideProps<AdminReviewsProps> = async ({ req }) => {
  const adminHost = process.env.ADMIN_PORTAL_HOST?.toLowerCase()
  const hostHeader = req.headers.host ?? ''
  const hostname = hostHeader.split(':')[0].toLowerCase()
  if (adminHost && hostname !== adminHost) {
    return { notFound: true }
  }

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

export default AdminReviews
