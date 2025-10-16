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
        <header className="admin-section__header">
          <div>
            <h1 className="admin-section__title">Audit trail</h1>
            <p className="admin-section__description">Investigate administrative activity with immutable entries.</p>
          </div>
          <span className="admin-badge">{user.email}</span>
        </header>

        {error ? (
          <p className="admin-error" role="alert">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p>Loading activity…</p>
        ) : entries.length === 0 ? (
          <p>No audit entries recorded.</p>
        ) : (
          <ul className="admin-audit-list">
            {entries.map((entry) => (
              <li key={entry.id} className="admin-audit-item">
                <div>
                  <strong>{entry.action}</strong> on <span>{entry.entity}</span>
                </div>
                <div className="admin-audit-meta">
                  <span>{entry.actorEmail ?? 'system'}</span>
                  <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time>
                </div>
                {entry.details ? <p>{entry.details}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
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
