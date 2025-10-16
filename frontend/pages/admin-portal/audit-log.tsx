import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import { useEffect, useState } from 'react'

import AdminLayout from '../../components/AdminLayout'
import type { SessionUser } from '../../lib/session'
import { getSessionFromRequest } from '../../lib/session'

type AuditEntry = {
  id: number
  action: string
  entity: string
  entityId: string
  createdAt: string
  actorEmail: string | null
  metadata: Record<string, unknown>
}

type AdminAuditLogProps = {
  user: SessionUser
}

const AdminAuditLog = ({ user }: AdminAuditLogProps): JSX.Element => {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/admin/audit-log')
        if (!response.ok) {
          throw new Error('load_failed')
        }
        const payload = (await response.json()) as { entries: AuditEntry[] }
        setEntries(payload.entries)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unexpected error')
      }
    }
    void load()
  }, [])

  return (
    <AdminLayout>
      <Head>
        <title>Audit log</title>
      </Head>
      <section className="admin-section">
        <header className="section-header">
          <div>
            <h1>Audit trail</h1>
            <p>Investigate administrative activity with immutable entries.</p>
          </div>
        </header>
        {error ? <p className="error">{error}</p> : null}
        <div className="log-wrapper">
          {entries.map((entry) => (
            <article key={entry.id} className="log-entry">
              <header>
                <strong>{entry.action}</strong>
                <span>{new Date(entry.createdAt).toLocaleString()}</span>
              </header>
              <p>
                {entry.actorEmail ?? 'system'} acted on {entry.entity} #{entry.entityId}
              </p>
              {Object.keys(entry.metadata || {}).length ? (
                <pre>{JSON.stringify(entry.metadata, null, 2)}</pre>
              ) : null}
            </article>
          ))}
          {!entries.length ? <p className="empty">No audit events recorded yet.</p> : null}
        </div>
      </section>
      <style jsx>{`
        .admin-section {
          display: grid;
          gap: 2rem;
          color: #e2e8f0;
        }

        .error {
          color: #fecaca;
          background: rgba(248, 113, 113, 0.12);
          padding: 0.75rem 1rem;
          border-radius: 12px;
        }

        .log-wrapper {
          display: grid;
          gap: 1rem;
        }

        .log-entry {
          padding: 1.5rem;
          border-radius: 16px;
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(148, 163, 184, 0.18);
        }

        header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        header span {
          color: rgba(148, 163, 184, 0.85);
          font-size: 0.9rem;
        }

        pre {
          background: rgba(15, 23, 42, 0.8);
          border-radius: 12px;
          padding: 0.75rem;
          overflow-x: auto;
          color: #bae6fd;
        }

        .empty {
          color: rgba(148, 163, 184, 0.85);
        }
      `}</style>
    </AdminLayout>
  )
}

export const getServerSideProps: GetServerSideProps<AdminAuditLogProps> = async ({ req }) => {
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

export default AdminAuditLog
