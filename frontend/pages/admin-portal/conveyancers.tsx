import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import { FormEvent, useEffect, useMemo, useState } from 'react'

import AdminLayout from '../../components/AdminLayout'
import type { SessionUser } from '../../lib/session'
import { getSessionFromRequest } from '../../lib/session'

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
      const response = await fetch('/api/admin/conveyancers')
      if (!response.ok) {
        throw new Error('load_failed')
      }
      const payload = (await response.json()) as { conveyancers: Conveyancer[] }
      setRecords(payload.conveyancers)
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
        const response = await fetch('/api/admin/conveyancers', {
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
        const response = await fetch('/api/admin/conveyancers', {
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
      const response = await fetch(`/api/admin/conveyancers?id=${id}`, { method: 'DELETE' })
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
                <th>State</th>
                <th>Verified</th>
                <th>Rating</th>
                <th>Reviews</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} data-active={selectedId === record.id}>
                  <td>
                    <strong>{record.firmName || record.fullName}</strong>
                    <span>{record.email}</span>
                  </td>
                  <td>{record.state}</td>
                  <td>{record.verified ? 'Yes' : 'No'}</td>
                  <td>{record.rating.toFixed(1)}</td>
                  <td>{record.reviewCount}</td>
                  <td>
                    <button type="button" onClick={() => setSelectedId(record.id)}>
                      Edit
                    </button>
                    <button type="button" onClick={() => handleDelete(record.id)} className="danger">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form className="editor" onSubmit={handleSubmit}>
          <h2>{selectedId ? 'Edit listing' : 'Create listing'}</h2>
          <div className="grid">
            <label>
              Email
              <input
                value={formState.email}
                onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))}
                type="email"
                required={!selectedId}
                disabled={Boolean(selectedId)}
              />
            </label>
            <label>
              Full name
              <input
                value={formState.fullName}
                onChange={(event) => setFormState((prev) => ({ ...prev, fullName: event.target.value }))}
                required
              />
            </label>
            <label>
              Firm name
              <input
                value={formState.firmName}
                onChange={(event) => setFormState((prev) => ({ ...prev, firmName: event.target.value }))}
              />
            </label>
            <label>
              State
              <input value={formState.state} onChange={(event) => setFormState((prev) => ({ ...prev, state: event.target.value }))} />
            </label>
            <label>
              Suburb
              <input
                value={formState.suburb}
                onChange={(event) => setFormState((prev) => ({ ...prev, suburb: event.target.value }))}
              />
            </label>
            <label>
              Phone
              <input value={formState.phone} onChange={(event) => setFormState((prev) => ({ ...prev, phone: event.target.value }))} />
            </label>
            <label>
              Website
              <input
                value={formState.website}
                onChange={(event) => setFormState((prev) => ({ ...prev, website: event.target.value }))}
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={formState.remoteFriendly}
                onChange={(event) => setFormState((prev) => ({ ...prev, remoteFriendly: event.target.checked }))}
              />
              Remote friendly
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={formState.verified}
                onChange={(event) => setFormState((prev) => ({ ...prev, verified: event.target.checked }))}
              />
              Verified listing
            </label>
            <label>
              Turnaround
              <input
                value={formState.turnaround}
                onChange={(event) => setFormState((prev) => ({ ...prev, turnaround: event.target.value }))}
              />
            </label>
            <label>
              Response time
              <input
                value={formState.responseTime}
                onChange={(event) => setFormState((prev) => ({ ...prev, responseTime: event.target.value }))}
              />
            </label>
            <label className="wide">
              Specialties
              <input value={formState.specialties.join(', ')} onChange={(event) => handleSpecialtiesChange(event.target.value)} />
            </label>
            <label className="wide">
              Bio
              <textarea
                value={formState.bio}
                onChange={(event) => setFormState((prev) => ({ ...prev, bio: event.target.value }))}
                rows={4}
              />
            </label>
            {!selectedId ? (
              <label className="wide">
                Temporary password
                <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={12} />
              </label>
            ) : null}
          </div>
          <button type="submit" disabled={status === 'saving'}>
            {status === 'saving' ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </section>
      <style jsx>{`
        .admin-section {
          display: grid;
          gap: 2.5rem;
          color: #e2e8f0;
        }

        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        h1 {
          margin: 0;
          font-size: 2.2rem;
        }

        .link-button {
          border: none;
          background: transparent;
          color: #38bdf8;
          font-weight: 600;
          cursor: pointer;
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
          color: inherit;
        }

        th,
        td {
          padding: 0.85rem 1.2rem;
          border-bottom: 1px solid rgba(148, 163, 184, 0.12);
          text-align: left;
        }

        tbody tr[data-active='true'] {
          background: rgba(37, 99, 235, 0.18);
        }

        td span {
          display: block;
          font-size: 0.85rem;
          color: rgba(148, 163, 184, 0.9);
        }

        td button {
          margin-right: 0.5rem;
          border: none;
          border-radius: 8px;
          padding: 0.35rem 0.75rem;
          background: rgba(59, 130, 246, 0.16);
          color: #93c5fd;
          cursor: pointer;
        }

        td button.danger {
          background: rgba(248, 113, 113, 0.18);
          color: #fecaca;
        }

        .editor {
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 18px;
          padding: 2rem;
          display: grid;
          gap: 1.5rem;
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

        textarea {
          resize: vertical;
        }

        .checkbox {
          align-items: center;
          grid-template-columns: auto 1fr;
        }

        .checkbox input {
          width: auto;
          margin-right: 0.5rem;
        }

        .wide {
          grid-column: 1 / -1;
        }

        .editor button {
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

export const getServerSideProps: GetServerSideProps<AdminConveyancersProps> = async ({ req }) => {
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

export default AdminConveyancers
