import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import { useMemo } from 'react'

import AdminLayout from '../components/AdminLayout'
import type { SessionUser } from '../../frontend/lib/session'
import { getSessionFromRequest } from '../../frontend/lib/session'

export type ContactChannel = {
  email: string
  phone: string
}

export type ContactPolicy = {
  jobId: string
  title: string
  status: string
  conveyancerId: string
  unlocked: boolean
  unlockToken: string | null
  unlockedAt?: string | null
  unlockedByRole?: string | null
  masked: {
    buyer: ContactChannel
    seller: ContactChannel
    conveyancer: ContactChannel
  }
  full?: {
    buyer: ContactChannel
    seller: ContactChannel
    conveyancer: ContactChannel
  }
  lastActivityAt: string
  quoteIssuedAt: string
  buyerIp: string
  sellerIp: string
  complianceFlags: string[]
  callSessions: Array<{
    id: string
    type: string
    status: string
    createdAt: string
    createdBy: string
    participants: string[]
    joinUrl: string
    accessToken?: string
  }>
  completionCertificate?: {
    id: string
    downloadUrl: string
    issuedAt: string
    verificationCode: string
  }
}

export type MlSignal = {
  type: string
  detail?: string
  severity?: string
  job_id?: string
  active_jobs?: number
  total_jobs?: number
  occurrences?: number
  buyer_ip?: string
  seller_ip?: string
}

export type InsightPayload = {
  generated_at: string
  signals: MlSignal[]
  training_inputs: {
    message_metadata: Array<Record<string, unknown>>
    payment_activity: Array<Record<string, unknown>>
    user_retention_metrics: Record<string, unknown>
    ip_correlation: Array<Record<string, unknown>>
  }
}

export type TemplateDefinition = {
  id: string
  name: string
  jurisdiction: string
  description: string
  tasks: Array<{
    id: string
    title: string
    default_assignee: string
    due_in_days: number
    escrow_required: boolean
  }>
}

type SafetyProps = {
  user: SessionUser
  policies: ContactPolicy[]
  insights: InsightPayload | null
  templates: TemplateDefinition[]
  error?: string
}

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

const SafetyPage = ({ user, policies, insights, templates, error }: SafetyProps): JSX.Element => {
  const unlockedCount = useMemo(() => policies.filter((policy) => policy.unlocked).length, [policies])

  return (
    <AdminLayout>
      <Head>
        <title>Platform safeguards</title>
      </Head>
      <section className="admin-section" aria-labelledby="safety-heading">
        <header className="admin-section__header">
          <div>
            <h1 id="safety-heading" className="admin-section__title">
              Safety controls & ML oversight
            </h1>
            <p className="admin-section__description">
              Review contact gating, voice/video collaboration tools, completion certificates, and machine learning
              signals that detect off-platform risk.
            </p>
            <p className="admin-section__operator">Duty officer: {user.fullName}</p>
          </div>
          <p className="admin-meta-chip" aria-live="polite">
            {insights ? `Insights generated ${formatDateTime(insights.generated_at)}` : 'ML insights unavailable'}
          </p>
        </header>
        {error ? (
          <p role="alert" className="admin-notice">
            {error}
          </p>
        ) : null}
      </section>

      <section className="admin-analytics" aria-labelledby="contact-heading">
        <header className="admin-analytics__header">
          <div>
            <h2 id="contact-heading">Contact release governance</h2>
            <p>Track which matters have full contact details unlocked and who authorised the release.</p>
          </div>
          <p className="admin-analytics__summary">
            {policies.length} tracked matters · {unlockedCount} unlocked · tokens secured server-side
          </p>
        </header>
        <div className="admin-table" role="region" aria-live="polite">
          <table>
            <thead>
              <tr>
                <th scope="col">Job</th>
                <th scope="col">Status</th>
                <th scope="col">Contact access</th>
                <th scope="col">Masked buyer</th>
                <th scope="col">Masked conveyancer</th>
                <th scope="col">Compliance flags</th>
                <th scope="col">Audit</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((policy) => (
                <tr key={policy.jobId}>
                  <th scope="row">
                    <div className="admin-entity">
                      <span className="admin-entity__title">{policy.title}</span>
                      <span className="admin-entity__meta">{policy.jobId}</span>
                    </div>
                  </th>
                  <td>
                    <span className={`admin-pill ${policy.status === 'completed' ? 'admin-pill--success' : ''}`}>
                      {policy.status}
                    </span>
                  </td>
                  <td>
                    <div className="admin-meta-block">
                      <strong>{policy.unlocked ? 'Unlocked' : 'Restricted'}</strong>
                      <p className="admin-meta-block__muted">
                        Token: {policy.unlockToken ?? '—'}
                      </p>
                    </div>
                  </td>
                  <td>
                    <div className="admin-meta-block">
                      <span>{policy.masked.buyer.email}</span>
                      <span className="admin-meta-block__muted">{policy.masked.buyer.phone}</span>
                    </div>
                  </td>
                  <td>
                    <div className="admin-meta-block">
                      <span>{policy.masked.conveyancer.email}</span>
                      <span className="admin-meta-block__muted">{policy.masked.conveyancer.phone}</span>
                    </div>
                  </td>
                  <td>
                    {policy.complianceFlags.length ? (
                      <ul className="admin-list">
                        {policy.complianceFlags.map((flag) => (
                          <li key={flag}>{flag}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="admin-meta-block__muted">None</span>
                    )}
                  </td>
                  <td>
                    <div className="admin-meta-block">
                      <span>{policy.unlockedByRole ?? '—'}</span>
                      <span className="admin-meta-block__muted">{formatDateTime(policy.unlockedAt ?? undefined)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-analytics" aria-labelledby="calls-heading">
        <header className="admin-analytics__header">
          <div>
            <h2 id="calls-heading">Voice &amp; video activity</h2>
            <p>Every session is issued with on-platform join URLs and access tokens scoped per call.</p>
          </div>
        </header>
        {policies.every((policy) => policy.callSessions.length === 0) ? (
          <p className="admin-empty">No voice or video collaboration scheduled.</p>
        ) : (
          <div className="admin-dashboard-grid">
            {policies
              .filter((policy) => policy.callSessions.length > 0)
              .map((policy) => (
                <article key={policy.jobId} className="admin-card">
                  <h3>{policy.title}</h3>
                  <ul className="admin-list">
                    {policy.callSessions.map((session) => (
                      <li key={session.id}>
                        <strong>{session.type.toUpperCase()}</strong> · {session.status} ·{' '}
                        {formatDateTime(session.createdAt)}
                        <div className="admin-meta-block__muted">
                          Token: {session.accessToken ?? 'n/a'} · Join: {session.joinUrl}
                        </div>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
          </div>
        )}
      </section>

      <section className="admin-analytics" aria-labelledby="cert-heading">
        <header className="admin-analytics__header">
          <div>
            <h2 id="cert-heading">Verified completion certificates</h2>
            <p>System-issued certificates include download links and verification codes for audit trails.</p>
          </div>
        </header>
        <ul className="admin-activity">
          {policies
            .filter((policy) => policy.completionCertificate)
            .map((policy) => (
              <li key={policy.jobId} className="admin-activity__item">
                <div>
                  <p className="admin-activity__title">{policy.title}</p>
                  <p className="admin-activity__meta">
                    Code {policy.completionCertificate?.verificationCode} · Issued{' '}
                    {formatDateTime(policy.completionCertificate?.issuedAt)}
                  </p>
                </div>
                <div className="admin-activity__figure">
                  <a className="admin-pill" href={policy.completionCertificate?.downloadUrl}>
                    Download certificate
                  </a>
                </div>
              </li>
            ))}
        </ul>
        {policies.some((policy) => policy.completionCertificate) ? null : (
          <p className="admin-empty">No verified certificates issued yet.</p>
        )}
      </section>

      <section className="admin-analytics" aria-labelledby="ml-heading">
        <header className="admin-analytics__header">
          <div>
            <h2 id="ml-heading">ML risk signals</h2>
            <p>Heuristics highlight contact exchanges, payment drop-offs, and correlated IP addresses.</p>
          </div>
          <p className="admin-analytics__summary">
            {insights ? `${insights.signals.length} active signals` : 'Insights unavailable'}
          </p>
        </header>
        {insights ? (
          <div className="admin-dashboard-grid">
            <article className="admin-card">
              <h3>Signals</h3>
              {insights.signals.length ? (
                <ul className="admin-list">
                  {insights.signals.map((signal, index) => (
                    <li key={`${signal.type}-${index}`}>
                      <strong>{signal.type}</strong>
                      {signal.detail ? ` — ${signal.detail}` : ''}
                      {signal.job_id ? <div className="admin-meta-block__muted">Job {signal.job_id}</div> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="admin-empty">No ML warnings at this time.</p>
              )}
            </article>
            <article className="admin-card">
              <h3>Training inputs</h3>
              <ul className="admin-list">
                <li>
                  Message metadata tracked: {insights.training_inputs.message_metadata.length}
                </li>
                <li>Payment activity records: {insights.training_inputs.payment_activity.length}</li>
                <li>
                  Retention snapshot: {JSON.stringify(insights.training_inputs.user_retention_metrics)}
                </li>
                <li>IP correlations tracked: {insights.training_inputs.ip_correlation.length}</li>
              </ul>
            </article>
          </div>
        ) : (
          <p className="admin-empty">Unable to load machine learning signals.</p>
        )}
      </section>

      <section className="admin-analytics" aria-labelledby="templates-heading">
        <header className="admin-analytics__header">
          <div>
            <h2 id="templates-heading">Template library</h2>
            <p>Reusable conveyancing templates generate task schedules directly within each job.</p>
          </div>
          <p className="admin-analytics__summary">{templates.length} templates available</p>
        </header>
        {templates.length ? (
          <div className="admin-dashboard-grid">
            {templates.map((template) => (
              <article key={template.id} className="admin-card">
                <h3>{template.name}</h3>
                <p className="admin-meta-block__muted">Jurisdiction: {template.jurisdiction}</p>
                <p>{template.description}</p>
                <ul className="admin-list">
                  {template.tasks.map((task) => (
                    <li key={task.id}>
                      <strong>{task.title}</strong> · due in {task.due_in_days} days ·{' '}
                      {task.escrow_required ? 'escrow gated' : 'no escrow requirement'}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        ) : (
          <p className="admin-empty">No templates configured.</p>
        )}
      </section>
    </AdminLayout>
  )
}

export const getServerSideProps: GetServerSideProps<SafetyProps> = async ({ req, res }) => {
  const user = getSessionFromRequest(req)
  if (!user || user.role !== 'admin') {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    }
  }

  const jobsServiceUrl = process.env.JOBS_SERVICE_URL ?? 'http://127.0.0.1:9002'
  const apiKey = process.env.SERVICE_API_KEY ?? 'local-dev-api-key'

  const headers = {
    'X-API-Key': apiKey,
    'X-Actor-Role': 'admin',
  }

  try {
    const [policiesRes, insightsRes, templatesRes] = await Promise.all([
      fetch(`${jobsServiceUrl}/admin/contact-policies`, { headers }),
      fetch(`${jobsServiceUrl}/admin/ml/insights`, { headers }),
      fetch(`${jobsServiceUrl}/jobs/templates`, { headers }),
    ])

    if (!policiesRes.ok || !insightsRes.ok || !templatesRes.ok) {
      const detail = `policies:${policiesRes.status} insights:${insightsRes.status} templates:${templatesRes.status}`
      return {
        props: {
          user,
          policies: [],
          insights: null,
          templates: [],
          error: `Unable to fetch safeguards (${detail})`,
        },
      }
    }

    const rawPolicies = (await policiesRes.json()) as Array<Record<string, any>>
    const policies: ContactPolicy[] = rawPolicies.map((entry) => ({
      jobId: String(entry.id ?? entry.job_id ?? ''),
      title: String(entry.title ?? ''),
      status: String(entry.status ?? ''),
      conveyancerId: String(entry.conveyancer_id ?? ''),
      unlocked: Boolean(entry.contact_policy?.unlocked ?? false),
      unlockToken: entry.contact_policy?.unlock_token ? String(entry.contact_policy.unlock_token) : null,
      unlockedAt: entry.contact_policy?.unlocked_at ? String(entry.contact_policy.unlocked_at) : null,
      unlockedByRole: entry.contact_policy?.unlocked_by_role ? String(entry.contact_policy.unlocked_by_role) : null,
      masked: {
        buyer: {
          email: String(entry.contact_policy?.masked?.buyer?.email ?? ''),
          phone: String(entry.contact_policy?.masked?.buyer?.phone ?? ''),
        },
        seller: {
          email: String(entry.contact_policy?.masked?.seller?.email ?? ''),
          phone: String(entry.contact_policy?.masked?.seller?.phone ?? ''),
        },
        conveyancer: {
          email: String(entry.contact_policy?.masked?.conveyancer?.email ?? ''),
          phone: String(entry.contact_policy?.masked?.conveyancer?.phone ?? ''),
        },
      },
      full: entry.contact_policy?.full
        ? {
            buyer: {
              email: String(entry.contact_policy.full.buyer?.email ?? ''),
              phone: String(entry.contact_policy.full.buyer?.phone ?? ''),
            },
            seller: {
              email: String(entry.contact_policy.full.seller?.email ?? ''),
              phone: String(entry.contact_policy.full.seller?.phone ?? ''),
            },
            conveyancer: {
              email: String(entry.contact_policy.full.conveyancer?.email ?? ''),
              phone: String(entry.contact_policy.full.conveyancer?.phone ?? ''),
            },
          }
        : undefined,
      lastActivityAt: String(entry.last_activity_at ?? ''),
      quoteIssuedAt: String(entry.quote_issued_at ?? ''),
      buyerIp: String(entry.buyer_ip ?? ''),
      sellerIp: String(entry.seller_ip ?? ''),
      complianceFlags: Array.isArray(entry.compliance_flags)
        ? (entry.compliance_flags as Array<string | number>).map((flag) => String(flag))
        : [],
      callSessions: Array.isArray(entry.call_sessions)
        ? (entry.call_sessions as Array<Record<string, any>>).map((session) => ({
            id: String(session.id ?? ''),
            type: String(session.type ?? ''),
            status: String(session.status ?? ''),
            createdAt: String(session.created_at ?? ''),
            createdBy: String(session.created_by ?? ''),
            participants: Array.isArray(session.participants)
              ? (session.participants as Array<string | number>).map((value) => String(value))
              : [],
            joinUrl: String(session.join_url ?? ''),
            accessToken: session.access_token ? String(session.access_token) : undefined,
          }))
        : [],
      completionCertificate: entry.completion_certificate
        ? {
            id: String(entry.completion_certificate.id ?? ''),
            downloadUrl: String(entry.completion_certificate.download_url ?? ''),
            issuedAt: String(entry.completion_certificate.issued_at ?? ''),
            verificationCode: String(entry.completion_certificate.verification_code ?? ''),
          }
        : undefined,
    }))

    const insights = (await insightsRes.json()) as InsightPayload
    const rawTemplates = (await templatesRes.json()) as Array<Record<string, any>>
    const templates: TemplateDefinition[] = rawTemplates.map((template) => ({
      id: String(template.id ?? ''),
      name: String(template.name ?? ''),
      jurisdiction: String(template.jurisdiction ?? ''),
      description: String(template.description ?? ''),
      tasks: Array.isArray(template.tasks)
        ? (template.tasks as Array<Record<string, any>>).map((task) => ({
            id: String(task.id ?? ''),
            title: String(task.title ?? ''),
            default_assignee: String(task.default_assignee ?? ''),
            due_in_days: Number(task.due_in_days ?? 0),
            escrow_required: Boolean(task.escrow_required ?? false),
          }))
        : [],
    }))

    return {
      props: {
        user,
        policies,
        insights,
        templates,
      },
    }
  } catch (fetchError) {
    const detail = fetchError instanceof Error ? fetchError.message : 'unexpected_error'
    return {
      props: {
        user,
        policies: [],
        insights: null,
        templates: [],
        error: `Failed to load safeguards (${detail})`,
      },
    }
  }
}

export default SafetyPage
