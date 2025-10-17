import Head from 'next/head'
import type { GetServerSideProps } from 'next'

import AdminLayout from '../components/AdminLayout'
import type { MetricsPayload } from './api/metrics'
import type { SessionUser } from '../../frontend/lib/session'
import { getSessionFromRequest } from '../../frontend/lib/session'

type DashboardProps = {
  user: SessionUser
  metrics: MetricsPayload | null
  error?: string
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(
    value / 100,
  )
}

const formatDate = (value: string): string => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

const DashboardPage = ({ user, metrics, error }: DashboardProps): JSX.Element => {
  const payments = metrics?.payments
  const invoiceStats = metrics?.invoices ?? null
  const checkoutStats = metrics?.checkouts ?? null

  return (
    <AdminLayout user={user}>
      <Head>
        <title>Operations dashboard</title>
      </Head>
      <section className="admin-section" aria-labelledby="operations-heading">
        <header className="admin-section__header">
          <div>
            <h1 id="operations-heading" className="admin-section__title">
              Control tower overview
            </h1>
            <p className="admin-section__description">
              Monitor real-time financial posture, trust accounting health, and activity across the marketplace.
            </p>
            <p className="admin-section__operator">On-call administrator: {user.fullName}</p>
          </div>
          <p className="admin-meta-chip" aria-live="polite">
            Snapshot generated {metrics ? formatDate(metrics.generatedAt) : 'recently'}
          </p>
        </header>

        {error ? (
          <p role="alert" className="admin-notice">
            Unable to reach the payments service right now. ({error})
          </p>
        ) : null}

        <div className="admin-dashboard-grid">
          <article className="admin-kpi">
            <h2>Accounts footprint</h2>
            <dl>
              <div>
                <dt>Verified conveyancers</dt>
                <dd>{metrics?.accounts.conveyancers ?? '—'}</dd>
              </div>
              <div>
                <dt>Active buyers</dt>
                <dd>{metrics?.accounts.buyers ?? '—'}</dd>
              </div>
              <div>
                <dt>Active sellers</dt>
                <dd>{metrics?.accounts.sellers ?? '—'}</dd>
              </div>
              <div>
                <dt>Published reviews</dt>
                <dd>{metrics?.accounts.reviews ?? '—'}</dd>
              </div>
            </dl>
          </article>

          <article className="admin-kpi">
            <h2>Escrow coverage</h2>
            <dl>
              <div>
                <dt>Held funds</dt>
                <dd>{payments ? formatCurrency(payments.held.totalCents) : '—'}</dd>
              </div>
              <div>
                <dt>Released year-to-date</dt>
                <dd>{payments ? formatCurrency(payments.released.totalCents) : '—'}</dd>
              </div>
              <div>
                <dt>Outstanding</dt>
                <dd>{payments ? formatCurrency(payments.outstandingCents) : '—'}</dd>
              </div>
              <div>
                <dt>Refunded</dt>
                <dd>{payments ? formatCurrency(payments.refunded.totalCents) : '—'}</dd>
              </div>
            </dl>
          </article>

          <article className="admin-kpi">
            <h2>Invoice posture</h2>
            <dl>
              <div>
                <dt>Total invoices</dt>
                <dd>{invoiceStats?.total ?? '—'}</dd>
              </div>
              <div>
                <dt>Outstanding value</dt>
                <dd>{invoiceStats ? formatCurrency(invoiceStats.outstandingCents) : '—'}</dd>
              </div>
              <div>
                <dt>Overdue</dt>
                <dd>{invoiceStats?.overdue ?? '—'}</dd>
              </div>
              <div>
                <dt>Paid</dt>
                <dd>{invoiceStats?.paid ?? '—'}</dd>
              </div>
            </dl>
          </article>
        </div>

        <section className="admin-analytics" aria-label="Payment flow breakdown">
          <header className="admin-analytics__header">
            <div>
              <h2>Funds trajectory</h2>
              <p>Track how escrow funds progress from hold to release and refunds.</p>
            </div>
            <p className="admin-analytics__summary">
              {payments
                ? `${formatCurrency(payments.released.totalCents)} released of ${formatCurrency(
                    payments.held.totalCents + payments.released.totalCents + payments.refunded.totalCents,
                  )} processed`
                : 'Awaiting data'}
            </p>
          </header>
          <div className="admin-analytics__bars" role="img" aria-label="Distribution of held, released, and refunded funds">
            {payments ? (
              (['held', 'released', 'refunded'] as const).map((bucketKey) => {
                const bucket = payments[bucketKey]
                const denominator =
                  payments.held.totalCents + payments.released.totalCents + payments.refunded.totalCents || 1
                const width = Math.max(8, Math.round((bucket.totalCents / denominator) * 100))
                const labelMap: Record<string, string> = {
                  held: 'Held funds',
                  released: 'Released funds',
                  refunded: 'Refunded funds',
                }
                return (
                  <div key={bucketKey} className={`admin-analytics__bar admin-analytics__bar--${bucketKey}`} style={{ width: `${width}%` }}>
                    <span>{labelMap[bucketKey] ?? bucketKey}</span>
                    <strong>{formatCurrency(bucket.totalCents)}</strong>
                  </div>
                )
              })
            ) : (
              <p className="admin-empty">Payment volume data unavailable.</p>
            )}
          </div>
        </section>

        <section className="admin-analytics" aria-label="Recent checkout activity">
          <header className="admin-analytics__header">
            <div>
              <h2>Recent checkouts</h2>
              <p>Latest milestone releases and their processing footprint.</p>
            </div>
            <p className="admin-analytics__summary">
              {checkoutStats
                ? `${checkoutStats.total} checkouts · ${formatCurrency(checkoutStats.totalCents)} settled · avg ${formatCurrency(
                    checkoutStats.averageOrderCents,
                  )}`
                : 'Waiting for recent activity'}
            </p>
          </header>
          <ul className="admin-activity" aria-live="polite">
            {checkoutStats?.recent.length ? (
              checkoutStats.recent.map((receipt) => (
                <li key={receipt.id} className="admin-activity__item">
                  <div>
                    <p className="admin-activity__title">{receipt.reference || receipt.jobId}</p>
                    <p className="admin-activity__meta">
                      {receipt.method} · {formatCurrency(receipt.totalCents)} · {formatDate(receipt.processedAt)}
                    </p>
                  </div>
                  <div className="admin-activity__figure">
                    <span className="admin-pill">Hold {formatCurrency(receipt.holdAmountCents)}</span>
                    {receipt.serviceFeeCents > 0 ? (
                      <span className="admin-pill admin-pill--muted">Fees {formatCurrency(receipt.serviceFeeCents)}</span>
                    ) : null}
                  </div>
                </li>
              ))
            ) : (
              <li className="admin-empty">No checkout activity recorded in the last few hours.</li>
            )}
          </ul>
        </section>

        <section className="admin-analytics" aria-label="Invoice lifecycle">
          <header className="admin-analytics__header">
            <div>
              <h2>Invoice lifecycle</h2>
              <p>Visualise current invoice stages and outstanding balances.</p>
            </div>
          </header>
          {invoiceStats ? (
            <div className="admin-invoice-grid">
              {(
                [
                  { key: 'draft', label: 'Draft', value: invoiceStats.draft },
                  { key: 'issued', label: 'Issued', value: invoiceStats.issued },
                  { key: 'paid', label: 'Paid', value: invoiceStats.paid },
                  { key: 'voided', label: 'Voided', value: invoiceStats.voided },
                ] as const
              ).map((stage) => (
                <div key={stage.key} className="admin-invoice-tile">
                  <h3>{stage.label}</h3>
                  <p>{stage.value}</p>
                  <div className="admin-invoice-progress">
                    <span style={{ width: `${Math.min(stage.value * 12, 100)}%` }} />
                  </div>
                </div>
              ))}
              <div className="admin-invoice-highlight">
                <h3>Outstanding value</h3>
                <p>{formatCurrency(invoiceStats.outstandingCents)}</p>
                <p className="admin-invoice-highlight__meta">Overdue invoices: {invoiceStats.overdue}</p>
              </div>
            </div>
          ) : (
            <p className="admin-empty">Invoice metrics unavailable.</p>
          )}
        </section>
      </section>
    </AdminLayout>
  )
}

export const getServerSideProps: GetServerSideProps<DashboardProps> = async ({ req, res }) => {
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
  const response = await fetch(`${protocol}://${hostHeader}/api/metrics`, {
    headers: { cookie: req.headers.cookie ?? '' },
  })

  let metrics: MetricsPayload | null = null
  let error: string | undefined
  if (response.ok) {
    metrics = (await response.json()) as MetricsPayload
  } else {
    error = `HTTP ${response.status}`
  }

  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate')
  return { props: { user, metrics, error } }
}

export default DashboardPage
