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
        <header className="section-header">
          <div>
            <h1>Conveyancer directory</h1>
            <p>Curate verified experts and keep marketplace metadata accurate.</p>
          </div>
          <button type="button" onClick={resetForm} className="link-button">
            Create new listing
          </button>
        </header>
        {error ? <p className="error">{error}</p> : null}
        <div className="table-wrapper">
          <table>
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
                    <button type="button" onClick={() => setSelectedId(record.id)} disabled={status === 'loading'}>
                      Edit
                    </button>
                    <button type="button" onClick={() => void handleDelete(record.id)} className="danger" disabled={status === 'loading'}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form className="editor" onSubmit={handleSubmit}>
          <h2>{selectedId ? 'Update conveyancer' : 'Create conveyancer'}</h2>
          <div className="grid">
            <label>
              Email
              <input
                type="email"
                value={formState.email}
                onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))}
                required
                disabled={Boolean(selectedId)}
              />
            </label>
            <label>
              Full name
              <input value={formState.fullName} onChange={(event) => setFormState((prev) => ({ ...prev, fullName: event.target.value }))} required />
            </label>
            <label>
              Firm
              <input value={formState.firmName} onChange={(event) => setFormState((prev) => ({ ...prev, firmName: event.target.value }))} />
            </label>
            <label>
              Phone
              <input value={formState.phone} onChange={(event) => setFormState((prev) => ({ ...prev, phone: event.target.value }))} />
            </label>
            <label>
              State
              <input value={formState.state} onChange={(event) => setFormState((prev) => ({ ...prev, state: event.target.value }))} />
            </label>
            <label>
              Suburb
              <input value={formState.suburb} onChange={(event) => setFormState((prev) => ({ ...prev, suburb: event.target.value }))} />
            </label>
            <label>
              Website
              <input value={formState.website} onChange={(event) => setFormState((prev) => ({ ...prev, website: event.target.value }))} />
            </label>
            <label>
              Turnaround
              <input value={formState.turnaround} onChange={(event) => setFormState((prev) => ({ ...prev, turnaround: event.target.value }))} />
            </label>
            <label>
              Response time
              <input value={formState.responseTime} onChange={(event) => setFormState((prev) => ({ ...prev, responseTime: event.target.value }))} />
            </label>
            <label>
              Specialties
              <input value={formState.specialties.join(', ')} onChange={(event) => handleSpecialtiesChange(event.target.value)} />
            </label>
            <label>
              Remote friendly
              <input type="checkbox" checked={formState.remoteFriendly} onChange={(event) => setFormState((prev) => ({ ...prev, remoteFriendly: event.target.checked }))} />
            </label>
            <label>
              Verified
              <input type="checkbox" checked={formState.verified} onChange={(event) => setFormState((prev) => ({ ...prev, verified: event.target.checked }))} />
            </label>
            {!selectedId ? (
              <label>
                Temporary password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Min 12 characters"
                  minLength={12}
                  required
                />
              </label>
            ) : null}
            <label className="span">
              Bio
              <textarea value={formState.bio} onChange={(event) => setFormState((prev) => ({ ...prev, bio: event.target.value }))} rows={4} />
            </label>
          </div>
          <div className="actions">
            <button type="submit" disabled={status !== 'idle'}>
              {selectedId ? 'Save changes' : 'Create account'}
            </button>
            {selectedId ? (
              <button type="button" className="secondary" onClick={resetForm}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </section>
      <style jsx>{`
        .admin-section {
          display: grid;
          gap: 2rem;
        }

        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .link-button {
          border: none;
          background: none;
          color: #38bdf8;
          cursor: pointer;
          font-weight: 600;
        }

        .error {
          color: #fecaca;
        }

        .table-wrapper {
          overflow-x: auto;
          border-radius: 18px;
          border: 1px solid rgba(148, 163, 184, 0.18);
        }

        table {
          width: 100%;
          border-collapse: collapse;
          background: rgba(15, 23, 42, 0.65);
        }

        th,
        td {
          padding: 0.75rem 1rem;
          text-align: left;
        }

        thead {
          background: rgba(30, 41, 59, 0.65);
        }

        tbody tr:nth-child(odd) {
          background: rgba(30, 41, 59, 0.3);
        }

        button {
          border: none;
          border-radius: 12px;
          padding: 0.6rem 1.1rem;
          font-weight: 600;
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          color: #f8fafc;
          cursor: pointer;
          margin-right: 0.5rem;
        }

        button.danger {
          background: rgba(239, 68, 68, 0.85);
        }

        button.secondary {
          background: rgba(148, 163, 184, 0.15);
          color: rgba(226, 232, 240, 0.85);
        }

        .editor {
          padding: 1.75rem;
          border-radius: 18px;
          background: rgba(15, 23, 42, 0.65);
          border: 1px solid rgba(148, 163, 184, 0.18);
          display: grid;
          gap: 1.25rem;
        }

        .grid {
          display: grid;
          gap: 1rem;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        }

        label {
          display: grid;
          gap: 0.35rem;
          font-size: 0.9rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: rgba(148, 163, 184, 0.88);
        }

        input,
        textarea {
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.3);
          background: rgba(15, 23, 42, 0.6);
          padding: 0.85rem 1rem;
          color: #f8fafc;
        }

        input[type='checkbox'] {
          width: auto;
          height: auto;
        }

        .span {
          grid-column: 1 / -1;
        }

        .actions {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
      `}</style>
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
