import Head from 'next/head'
import type { GetServerSideProps } from 'next'

import AdminLayout from '../../components/AdminLayout'
import type { SessionUser } from '../../lib/session'
import { getSessionFromRequest } from '../../lib/session'

type Summary = {
  conveyancers: number
  buyers: number
  sellers: number
  reviews: number
  lastAuditEvent?: {
    action: string
    entity: string
    actorEmail: string | null
    createdAt: string
  }
}

type AdminDashboardProps = {
  user: SessionUser
  summary: Summary | null
}

const formatDate = (value?: string): string => {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

const AdminDashboard = ({ user, summary }: AdminDashboardProps): JSX.Element => {
  return (
    <AdminLayout>
      <Head>
        <title>Admin dashboard</title>
      </Head>
      <section className="admin-section">
        <header className="section-header">
          <div>
            <h1>Welcome back, {user.fullName}</h1>
            <p>Review the platform posture and respond to operational alerts.</p>
          </div>
        </header>
        {summary ? (
          <div className="stat-grid">
            <article className="stat-card">
              <h2>Verified conveyancers</h2>
              <p className="stat-value">{summary.conveyancers}</p>
            </article>
            <article className="stat-card">
              <h2>Buyer accounts</h2>
              <p className="stat-value">{summary.buyers}</p>
            </article>
            <article className="stat-card">
              <h2>Seller accounts</h2>
              <p className="stat-value">{summary.sellers}</p>
            </article>
            <article className="stat-card">
              <h2>Published reviews</h2>
              <p className="stat-value">{summary.reviews}</p>
            </article>
          </div>
        ) : (
          <p className="notice">Unable to load summary metrics.</p>
        )}
        {summary?.lastAuditEvent ? (
          <section className="audit-inline">
            <h2>Latest change</h2>
            <p>
              {summary.lastAuditEvent.action} on {summary.lastAuditEvent.entity} by{' '}
              {summary.lastAuditEvent.actorEmail ?? 'system'} at {formatDate(summary.lastAuditEvent.createdAt)}
            </p>
          </section>
        ) : null}
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

        h1 {
          margin: 0;
          font-size: 2.5rem;
          color: #f8fafc;
        }

        p {
          color: rgba(226, 232, 240, 0.78);
        }

        .stat-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 1.5rem;
        }

        .stat-card {
          padding: 1.75rem;
          border-radius: 18px;
          background: rgba(15, 23, 42, 0.65);
          border: 1px solid rgba(148, 163, 184, 0.18);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 18px 40px rgba(15, 23, 42, 0.4);
        }

        .stat-card h2 {
          margin: 0;
          font-size: 1rem;
          color: rgba(148, 163, 184, 0.9);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .stat-value {
          margin: 0.75rem 0 0;
          font-size: 2.5rem;
          font-weight: 600;
          color: #38bdf8;
        }

        .audit-inline {
          padding: 1.5rem;
          border-radius: 14px;
          background: rgba(37, 99, 235, 0.12);
          border: 1px solid rgba(59, 130, 246, 0.25);
        }

        .notice {
          background: rgba(248, 113, 113, 0.12);
          border-radius: 12px;
          padding: 1rem;
          color: #fecaca;
        }
      `}</style>
    </AdminLayout>
  )
}

export const getServerSideProps: GetServerSideProps<AdminDashboardProps> = async ({ req }) => {
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

  const protocol = (req.headers['x-forwarded-proto'] as string) ?? 'http'
  const response = await fetch(`${protocol}://${hostHeader}/api/admin/summary`, {
    headers: { cookie: req.headers.cookie ?? '' },
  })
  const summary = response.ok ? ((await response.json()) as Summary) : null

  return { props: { user, summary } }
}

export default AdminDashboard
