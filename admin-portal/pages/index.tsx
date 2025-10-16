import Head from 'next/head'
import type { GetServerSideProps } from 'next'

import AdminLayout from '../components/AdminLayout'
import type { SessionUser } from '../../frontend/lib/session'
import { getSessionFromRequest } from '../../frontend/lib/session'

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

const createSparklinePath = (series: readonly number[]): { line: string; area: string } => {
  if (series.length === 0) {
    return { line: '', area: '' }
  }
  const denominator = series.length > 1 ? series.length - 1 : 1
  const max = Math.max(...series)
  const min = Math.min(...series)
  const range = max - min === 0 ? 1 : max - min
  const points = series.map((value, index) => {
    const x = (index / denominator) * 100
    const y = 100 - ((value - min) / range) * 100
    return { x, y }
  })

  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ')
  const areaPoints = points.map((point) => `L${point.x},${point.y}`).join(' ')
  const area = `M0,100 ${areaPoints} L100,100 Z`
  return { line, area }
}

const monitoringPanels = [
  {
    id: 'escrow',
    title: 'Escrow release compliance',
    value: '99.4%',
    trend: '+0.6% vs last week',
    series: [92, 94, 95, 97, 96, 98, 99.4],
    footnote: 'Alerts trigger when compliance dips below 97% in any 24 hour period.',
  },
  {
    id: 'response',
    title: 'Median support response',
    value: '7m',
    trend: 'SLA met 100% of sessions',
    series: [15, 12, 11, 9, 8, 7.5, 7],
    footnote: 'Measured across live chat escalations in the last 12 hours.',
  },
  {
    id: 'audit',
    title: 'Critical alerts acknowledged',
    value: '12 / 12',
    trend: '0 pending acknowledgements',
    series: [8, 9, 11, 10, 12, 12, 12],
    footnote: 'Audit log confirmations within the last four maintenance windows.',
  },
] as const

const AdminDashboard = ({ user, summary }: AdminDashboardProps): JSX.Element => {
  return (
    <AdminLayout>
      <Head>
        <title>Admin dashboard</title>
      </Head>
      <section className="admin-section">
        <header className="admin-section__header">
          <div>
            <h1 className="admin-section__title">Welcome back, {user.fullName}</h1>
            <p className="admin-section__description">Review the platform posture and respond to operational alerts.</p>
          </div>
        </header>
        {summary ? (
          <div className="admin-metric-grid" role="list">
            <article className="admin-card admin-card--stat" role="listitem">
              <h2>Verified conveyancers</h2>
              <p className="admin-card__value">{summary.conveyancers}</p>
            </article>
            <article className="admin-card admin-card--stat" role="listitem">
              <h2>Buyer accounts</h2>
              <p className="admin-card__value">{summary.buyers}</p>
            </article>
            <article className="admin-card admin-card--stat" role="listitem">
              <h2>Seller accounts</h2>
              <p className="admin-card__value">{summary.sellers}</p>
            </article>
            <article className="admin-card admin-card--stat" role="listitem">
              <h2>Published reviews</h2>
              <p className="admin-card__value">{summary.reviews}</p>
            </article>
          </div>
        ) : (
          <p className="admin-notice" role="status">
            Unable to load summary metrics.
          </p>
        )}
        <section className="admin-monitoring" aria-label="Operational monitoring insights">
          <header className="admin-section__header">
            <div>
              <h2 className="admin-section__subtitle">Control room snapshots</h2>
              <p className="admin-section__description">
                Track the signals operators rely on to keep conveyancing workloads healthy.
              </p>
            </div>
          </header>
          <div className="admin-monitoring__grid">
            {monitoringPanels.map((panel) => {
              const { line, area } = createSparklinePath(panel.series)
              const gradientId = `spark-${panel.id}`
              return (
                <article key={panel.id} className="admin-monitoring__card">
                  <div className="admin-monitoring__header">
                    <div>
                      <h3>{panel.title}</h3>
                      <p className="admin-monitoring__trend">{panel.trend}</p>
                    </div>
                    <p className="admin-monitoring__value">{panel.value}</p>
                  </div>
                  <div className="admin-monitoring__chart" role="img" aria-label={`${panel.title} trend graph`}>
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(96, 165, 250, 0.75)" />
                          <stop offset="100%" stopColor="rgba(96, 165, 250, 0)" />
                        </linearGradient>
                      </defs>
                      <path d={area} fill={`url(#${gradientId})`} opacity={0.6} />
                      <path d={line} fill="none" stroke="rgba(96, 165, 250, 0.95)" strokeWidth={2.5} strokeLinecap="round" />
                    </svg>
                  </div>
                  <p className="admin-monitoring__footnote">{panel.footnote}</p>
                </article>
              )
            })}
          </div>
        </section>
        {summary?.lastAuditEvent ? (
          <section className="admin-inline-panel" aria-live="polite">
            <h2>Latest change</h2>
            <p>
              <strong>{summary.lastAuditEvent.action}</strong> on {summary.lastAuditEvent.entity} by{' '}
              {summary.lastAuditEvent.actorEmail ?? 'system'} at {formatDate(summary.lastAuditEvent.createdAt)}
            </p>
          </section>
        ) : null}
      </section>
    </AdminLayout>
  )
}

export const getServerSideProps: GetServerSideProps<AdminDashboardProps> = async ({ req, res }) => {
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
  const hostHeader = req.headers.host ?? 'localhost:5300'
  const response = await fetch(`${protocol}://${hostHeader}/api/summary`, {
    headers: { cookie: req.headers.cookie ?? '' },
  })
  const summary = response.ok ? ((await response.json()) as Summary) : null

  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate')
  return { props: { user, summary } }
}

export default AdminDashboard
