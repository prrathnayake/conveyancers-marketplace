import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import { useEffect, useState } from 'react'

import AdminLayout from '../components/AdminLayout'
import type { SessionUser } from '../../frontend/lib/session'
import { getSessionFromRequest } from '../../frontend/lib/session'

type AuditEntry = {
  id: number
  action: string
  entity: string
  details: string | null
  actorEmail: string | null
  createdAt: string
}

type AuditLogPageProps = {
  user: SessionUser
}

const AdminAuditLog = ({ user }: AuditLogPageProps): JSX.Element => {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const loadEntries = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/audit-log')
      if (!response.ok) {
        throw new Error('Failed to fetch audit log')
      }
      const data = (await response.json()) as AuditEntry[]
      setEntries(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadEntries()
  }, [])

  return (
    <AdminLayout>
      <Head>
        <title>Audit activity</title>
      </Head>
      <section className="admin-section">
        <header className="section-header">
          <div>
            <h1>Audit trail</h1>
            <p>Investigate administrative activity with immutable entries.</p>
          </div>
          <span className="badge">{user.email}</span>
        </header>

        {error ? <p className="error">{error}</p> : null}

        {loading ? (
          <p>Loading activity…</p>
        ) : entries.length === 0 ? (
          <p>No audit entries recorded.</p>
        ) : (
          <ul className="audit-list">
            {entries.map((entry) => (
              <li key={entry.id}>
                <div>
                  <strong>{entry.action}</strong> on <span>{entry.entity}</span>
                </div>
                <div className="meta">
                  <span>{entry.actorEmail ?? 'system'}</span>
                  <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time>
                </div>
                {entry.details ? <p>{entry.details}</p> : null}
              </li>
            ))}
          </ul>
        )}
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

        .badge {
          padding: 0.35rem 0.75rem;
          border-radius: 999px;
          background: rgba(96, 165, 250, 0.2);
          border: 1px solid rgba(96, 165, 250, 0.35);
        }

        .audit-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 1.25rem;
        }

        li {
          padding: 1.5rem;
          border-radius: 18px;
          background: rgba(15, 23, 42, 0.65);
          border: 1px solid rgba(148, 163, 184, 0.18);
        }

        li span {
          color: #38bdf8;
        }

        .meta {
          display: flex;
          gap: 1rem;
          font-size: 0.9rem;
          color: rgba(148, 163, 184, 0.88);
        }

        .meta time {
          font-variant-numeric: tabular-nums;
        }

        .error {
          color: #fecaca;
        }
      `}</style>
    </AdminLayout>
  )
}

export const getServerSideProps: GetServerSideProps<AuditLogPageProps> = async ({ req }) => {
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

export default AdminAuditLog
