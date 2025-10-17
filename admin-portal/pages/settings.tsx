import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import { ChangeEvent, FormEvent, useState } from 'react'

import AdminLayout from '../components/AdminLayout'
import type { SessionUser } from '../../frontend/lib/session'
import { getSessionFromRequest } from '../../frontend/lib/session'

const formatRateInput = (value: string | undefined): string => {
  const numeric = Number(value ?? 0)
  if (!Number.isFinite(numeric)) {
    return '5'
  }
  return (numeric * 100).toString()
}

type SettingsFormState = {
  supportEmail: string
  statusBanner: string
  serviceFeeRate: string
  escrowAccountName: string
}

type SettingsPageProps = {
  user: SessionUser
  initialSettings: SettingsFormState
}

const SettingsPage = ({ user, initialSettings }: SettingsPageProps): JSX.Element => {
  const [settings, setSettings] = useState<SettingsFormState>(initialSettings)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target
    setSettings((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatus('saving')
    setError(null)
    const numericRate = Number(settings.serviceFeeRate)
    const normalisedRate = Number.isFinite(numericRate) && numericRate >= 0 ? numericRate / 100 : 0.05
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            supportEmail: settings.supportEmail.trim(),
            statusBanner: settings.statusBanner,
            serviceFeeRate: normalisedRate.toString(),
            escrowAccountName: settings.escrowAccountName.trim(),
          },
        }),
      })
      if (!response.ok) {
        throw new Error('Unable to update settings')
      }
      setStatus('saved')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Unexpected error')
    }
  }

  return (
    <AdminLayout user={user}>
      <Head>
        <title>Platform settings</title>
      </Head>
      <section className="admin-section" aria-labelledby="settings-heading">
        <header className="admin-section__header">
          <div>
            <h1 id="settings-heading" className="admin-section__title">
              Configure marketplace controls
            </h1>
            <p className="admin-section__description">
              Adjust billing rates, notices, and compliance touchpoints across the marketplace experience.
            </p>
          </div>
          <p className="admin-meta-chip">Administrator: {user.fullName}</p>
        </header>
        <form className="admin-form" onSubmit={handleSubmit}>
          <fieldset>
            <legend>Messaging</legend>
            <label className="admin-form__label">
              <span>Support email</span>
              <input
                name="supportEmail"
                type="email"
                className="admin-input"
                value={settings.supportEmail}
                onChange={handleChange}
                required
              />
            </label>
            <label className="admin-form__label admin-form__label--span">
              <span>Status banner</span>
              <textarea
                name="statusBanner"
                rows={3}
                className="admin-textarea"
                value={settings.statusBanner}
                onChange={handleChange}
                placeholder="Displayed to buyers and sellers during incidents"
              />
            </label>
          </fieldset>
          <fieldset>
            <legend>Financial controls</legend>
            <label className="admin-form__label">
              <span>Service fee percentage</span>
              <div className="admin-input-with-addon">
                <input
                  name="serviceFeeRate"
                  type="number"
                  min="0"
                  step="0.1"
                  value={settings.serviceFeeRate}
                  onChange={handleChange}
                  aria-describedby="service-fee-help"
                  className="admin-input"
                />
                <span className="admin-input-addon">%</span>
              </div>
              <p id="service-fee-help" className="admin-field__help">
                Applied to invoices accepted in chat before escrow funds are held.
              </p>
            </label>
            <label className="admin-form__label">
              <span>Escrow account label</span>
              <input
                name="escrowAccountName"
                className="admin-input"
                value={settings.escrowAccountName}
                onChange={handleChange}
                placeholder="e.g. ConveySafe Trust Account"
              />
            </label>
          </fieldset>
          <div className="admin-form__actions">
            <button type="submit" className="cta-primary" disabled={status === 'saving'}>
              {status === 'saving' ? 'Saving…' : 'Save settings'}
            </button>
            {status === 'saved' ? <span className="admin-status admin-status--success">Saved</span> : null}
            {status === 'error' ? (
              <span className="admin-status admin-status--error">{error ?? 'Unable to save settings'}</span>
            ) : null}
          </div>
        </form>
      </section>
    </AdminLayout>
  )
}

export const getServerSideProps: GetServerSideProps<SettingsPageProps> = async ({ req }) => {
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
  const response = await fetch(`${protocol}://${hostHeader}/api/settings`, {
    headers: { cookie: req.headers.cookie ?? '' },
  })
  const payload = response.ok
    ? ((await response.json()) as { settings: Record<string, string> })
    : { settings: {} as Record<string, string> }

  const initialSettings: SettingsFormState = {
    supportEmail: payload.settings.supportEmail ?? '',
    statusBanner: payload.settings.statusBanner ?? '',
    serviceFeeRate: formatRateInput(payload.settings.serviceFeeRate),
    escrowAccountName: payload.settings.escrowAccountName ?? 'ConveySafe Trust Account',
  }

  return { props: { user, initialSettings } }
}

export default SettingsPage
