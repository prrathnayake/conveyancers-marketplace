import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import { FormEvent, useEffect, useState } from 'react'

import AdminLayout from '../components/AdminLayout'
import type { SessionUser } from '../../frontend/lib/session'
import { getSessionFromRequest } from '../../frontend/lib/session'

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
      const response = await fetch('/api/reviews')
      if (!response.ok) {
        throw new Error('load_failed')
      }
      const payload = (await response.json()) as Review[]
      setRecords(payload)
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
      const response = await fetch(`/api/reviews?id=${id}`, { method: 'DELETE' })
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
      const response = await fetch('/api/reviews', {
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
    <AdminLayout user={user}>
      <Head>
        <title>Manage reviews</title>
      </Head>
      <section className="admin-section">
        <header className="admin-section__header">
          <div>
            <h1 className="admin-section__title">Reviews moderation</h1>
            <p className="admin-section__description">Ensure testimonials comply with advertising guidelines.</p>
          </div>
        </header>
        {error ? (
          <p className="admin-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="admin-table-wrapper">
          <table className="admin-table">
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
                    <button
                      type="button"
                      onClick={() => handleDelete(review.id)}
                      className="admin-button admin-button--danger"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form className="admin-form" onSubmit={handleSubmit}>
          <h2>Publish review</h2>
          <label className="admin-form__label">
            Conveyancer ID
            <input
              className="admin-input"
              value={formState.conveyancerId}
              onChange={(event) => setFormState((prev) => ({ ...prev, conveyancerId: event.target.value }))}
              type="number"
              min={1}
              required
            />
          </label>
          <label className="admin-form__label">
            Reviewer name
            <input
              className="admin-input"
              value={formState.reviewerName}
              onChange={(event) => setFormState((prev) => ({ ...prev, reviewerName: event.target.value }))}
              required
            />
          </label>
          <label className="admin-form__label">
            Rating
            <input
              className="admin-input"
              value={formState.rating}
              onChange={(event) => setFormState((prev) => ({ ...prev, rating: Number(event.target.value) }))}
              type="number"
              min={1}
              max={5}
              required
            />
          </label>
          <label className="admin-form__label admin-form__label--span">
            Comment
            <textarea
              className="admin-textarea"
              value={formState.comment}
              onChange={(event) => setFormState((prev) => ({ ...prev, comment: event.target.value }))}
              rows={3}
              required
            />
          </label>
          <button type="submit" className="admin-button" disabled={status === 'saving'}>
            {status === 'saving' ? 'Publishing…' : 'Publish review'}
          </button>
        </form>
      </section>
    </AdminLayout>
  )
}

export const getServerSideProps: GetServerSideProps<AdminReviewsProps> = async ({ req }) => {
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
