import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import { FormEvent, useEffect, useMemo, useState } from 'react'

import AdminLayout from '../components/AdminLayout'
import type { SessionUser } from '../../frontend/lib/session'
import { getSessionFromRequest } from '../../frontend/lib/session'

type Conveyancer = {
  id: number
  email: string
  fullName: string
  firmName: string
  bio: string
  phone: string
  state: string
  suburb: string
  website: string
  remoteFriendly: boolean
  turnaround: string
  responseTime: string
  specialties: string[]
  verified: boolean
  rating: number
  reviewCount: number
}

type AdminConveyancersProps = {
  user: SessionUser
}

const AdminConveyancers = ({ user }: AdminConveyancersProps): JSX.Element => {
  const [records, setRecords] = useState<Conveyancer[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [formState, setFormState] = useState<Omit<Conveyancer, 'id' | 'rating' | 'reviewCount'>>({
    email: '',
    fullName: '',
    firmName: '',
    bio: '',
    phone: '',
    state: '',
    suburb: '',
    website: '',
    remoteFriendly: false,
    turnaround: '',
    responseTime: '',
    specialties: [],
    verified: false,
  })
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'loading'>('idle')
  const [error, setError] = useState<string | null>(null)

  const loadRecords = async () => {
    setStatus('loading')
    try {
      const response = await fetch('/api/conveyancers')
      if (!response.ok) {
        throw new Error('load_failed')
      }
      const payload = (await response.json()) as Conveyancer[]
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

  const selectedRecord = useMemo(() => records.find((record) => record.id === selectedId) ?? null, [records, selectedId])

  useEffect(() => {
    if (selectedRecord) {
      const { rating, reviewCount, id, ...rest } = selectedRecord
      setFormState(rest)
      setPassword('')
    }
  }, [selectedRecord])

  const resetForm = () => {
    setSelectedId(null)
    setFormState({
      email: '',
      fullName: '',
      firmName: '',
      bio: '',
      phone: '',
      state: '',
      suburb: '',
      website: '',
      remoteFriendly: false,
      turnaround: '',
      responseTime: '',
      specialties: [],
      verified: false,
    })
    setPassword('')
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatus('saving')
    setError(null)
    try {
      const payload = {
        ...formState,
        specialties: formState.specialties,
      }
      if (selectedId) {
        const response = await fetch('/api/conveyancers', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: selectedId, profile: payload, fullName: formState.fullName }),
        })
        if (!response.ok) {
          throw new Error('update_failed')
        }
      } else {
        if (!password || password.length < 12) {
          throw new Error('Password must be at least 12 characters long for new accounts.')
        }
        const response = await fetch('/api/conveyancers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formState.email,
            fullName: formState.fullName,
            password,
            profile: payload,
          }),
        })
        if (!response.ok) {
          throw new Error('create_failed')
        }
      }
      await loadRecords()
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error')
    } finally {
      setStatus('idle')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this conveyancer?')) {
      return
    }
    setStatus('loading')
    setError(null)
    try {
      const response = await fetch(`/api/conveyancers?id=${id}`, { method: 'DELETE' })
      if (!response.ok) {
        throw new Error('delete_failed')
      }
      await loadRecords()
      if (selectedId === id) {
        resetForm()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error')
    } finally {
      setStatus('idle')
    }
  }

  const handleSpecialtiesChange = (value: string) => {
    setFormState((prev) => ({
      ...prev,
      specialties: value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    }))
  }

  return (
    <AdminLayout>
      <Head>
        <title>Manage conveyancers</title>
      </Head>
      <section className="admin-section">
        <header className="admin-section__header">
          <div>
            <h1 className="admin-section__title">Conveyancer directory</h1>
            <p className="admin-section__description">Curate verified experts and keep marketplace metadata accurate.</p>
          </div>
          <button type="button" onClick={resetForm} className="admin-button admin-button--ghost">
            Create new listing
          </button>
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
                <th>Name</th>
                <th>Firm</th>
                <th>State</th>
                <th>Rating</th>
                <th>Reviews</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td>{record.fullName}</td>
                  <td>{record.firmName}</td>
                  <td>{record.state}</td>
                  <td>{record.rating.toFixed(1)}</td>
                  <td>{record.reviewCount}</td>
                  <td>
                    <button
                      type="button"
                      className="admin-button"
                      onClick={() => setSelectedId(record.id)}
                      disabled={status === 'loading'}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(record.id)}
                      className="admin-button admin-button--danger"
                      disabled={status === 'loading'}
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
          <h2>{selectedId ? 'Update conveyancer' : 'Create conveyancer'}</h2>
          <div className="admin-form__grid">
            <label className="admin-form__label">
              Email
              <input
                className="admin-input"
                type="email"
                value={formState.email}
                onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))}
                required
                disabled={Boolean(selectedId)}
              />
            </label>
            <label className="admin-form__label">
              Full name
              <input
                className="admin-input"
                value={formState.fullName}
                onChange={(event) => setFormState((prev) => ({ ...prev, fullName: event.target.value }))}
                required
              />
            </label>
            <label className="admin-form__label">
              Firm
              <input
                className="admin-input"
                value={formState.firmName}
                onChange={(event) => setFormState((prev) => ({ ...prev, firmName: event.target.value }))}
              />
            </label>
            <label className="admin-form__label">
              Phone
              <input
                className="admin-input"
                value={formState.phone}
                onChange={(event) => setFormState((prev) => ({ ...prev, phone: event.target.value }))}
              />
            </label>
            <label className="admin-form__label">
              State
              <input
                className="admin-input"
                value={formState.state}
                onChange={(event) => setFormState((prev) => ({ ...prev, state: event.target.value }))}
              />
            </label>
            <label className="admin-form__label">
              Suburb
              <input
                className="admin-input"
                value={formState.suburb}
                onChange={(event) => setFormState((prev) => ({ ...prev, suburb: event.target.value }))}
              />
            </label>
            <label className="admin-form__label">
              Website
              <input
                className="admin-input"
                value={formState.website}
                onChange={(event) => setFormState((prev) => ({ ...prev, website: event.target.value }))}
              />
            </label>
            <label className="admin-form__label">
              Turnaround
              <input
                className="admin-input"
                value={formState.turnaround}
                onChange={(event) => setFormState((prev) => ({ ...prev, turnaround: event.target.value }))}
              />
            </label>
            <label className="admin-form__label">
              Response time
              <input
                className="admin-input"
                value={formState.responseTime}
                onChange={(event) => setFormState((prev) => ({ ...prev, responseTime: event.target.value }))}
              />
            </label>
            <label className="admin-form__label">
              Specialties
              <input
                className="admin-input"
                value={formState.specialties.join(', ')}
                onChange={(event) => handleSpecialtiesChange(event.target.value)}
              />
            </label>
            <label className="admin-form__label">
              Remote friendly
              <input
                className="admin-checkbox"
                type="checkbox"
                checked={formState.remoteFriendly}
                onChange={(event) => setFormState((prev) => ({ ...prev, remoteFriendly: event.target.checked }))}
              />
            </label>
            <label className="admin-form__label">
              Verified
              <input
                className="admin-checkbox"
                type="checkbox"
                checked={formState.verified}
                onChange={(event) => setFormState((prev) => ({ ...prev, verified: event.target.checked }))}
              />
            </label>
            {!selectedId ? (
              <label className="admin-form__label">
                Temporary password
                <input
                  className="admin-input"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Min 12 characters"
                  minLength={12}
                  required
                />
              </label>
            ) : null}
            <label className="admin-form__label admin-form__label--span">
              Bio
              <textarea
                className="admin-textarea"
                value={formState.bio}
                onChange={(event) => setFormState((prev) => ({ ...prev, bio: event.target.value }))}
                rows={4}
              />
            </label>
          </div>
          <div className="admin-form__actions">
            <button type="submit" className="admin-button" disabled={status !== 'idle'}>
              {selectedId ? 'Save changes' : 'Create account'}
            </button>
            {selectedId ? (
              <button type="button" className="admin-button admin-button--secondary" onClick={resetForm}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </section>
    </AdminLayout>
  )
}

export const getServerSideProps: GetServerSideProps<AdminConveyancersProps> = async ({ req }) => {
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

export default AdminConveyancers
