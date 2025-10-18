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
  organisationName: string
  organisationTagline: string
  organisationLogo: string
  supportPhone: string
}

type SettingsPageProps = {
  user: SessionUser
  initialSettings: SettingsFormState
}

const SettingsPage = ({ user, initialSettings }: SettingsPageProps): JSX.Element => {
  const [settings, setSettings] = useState<SettingsFormState>(initialSettings)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [logoError, setLogoError] = useState<string | null>(null)

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target
    setSettings((prev) => ({ ...prev, [name]: value }))
  }

  const handleLogoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    if (!file.type.startsWith('image/')) {
      setLogoError('Upload a PNG, JPG, or WebP logo.')
      return
    }
    if (file.size > 512 * 1024) {
      setLogoError('Logo files must be under 512 KB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSettings((prev) => ({ ...prev, organisationLogo: reader.result as string }))
        setLogoError(null)
      } else {
        setLogoError('Unable to read logo file.')
      }
    }
    reader.readAsDataURL(file)
  }

  const handleLogoRemove = () => {
    setSettings((prev) => ({ ...prev, organisationLogo: '' }))
    setLogoError(null)
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
            organisationName: settings.organisationName.trim(),
            organisationTagline: settings.organisationTagline.trim(),
            organisationLogo: settings.organisationLogo,
            supportPhone: settings.supportPhone.trim(),
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
            <legend>Branding</legend>
            <label className="admin-form__label">
              <span>Organisation name</span>
              <input
                name="organisationName"
                className="admin-input"
                value={settings.organisationName}
                onChange={handleChange}
                required
              />
            </label>
            <label className="admin-form__label">
              <span>Tagline</span>
              <input
                name="organisationTagline"
                className="admin-input"
                value={settings.organisationTagline}
                onChange={handleChange}
              />
            </label>
            <div className="admin-logo-uploader">
              <div className="admin-logo-preview" aria-live="polite">
                {settings.organisationLogo ? (
                  <img src={settings.organisationLogo} alt="Organisation logo preview" />
                ) : (
                  <span aria-hidden="true">{settings.organisationName.charAt(0)}</span>
                )}
              </div>
              <div className="admin-logo-actions">
                <label className="admin-form__label">
                  <span>System logo</span>
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoChange} />
                </label>
                <div className="admin-logo-buttons">
                  <button type="button" className="cta-secondary" onClick={handleLogoRemove} disabled={!settings.organisationLogo}>
                    Remove logo
                  </button>
                </div>
                <p className="admin-field__help">Used in navigation bars across the marketplace and admin portal.</p>
                {logoError ? <p className="admin-status admin-status--error">{logoError}</p> : null}
              </div>
            </div>
          </fieldset>
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
            <label className="admin-form__label">
              <span>Support phone</span>
              <input
                name="supportPhone"
                className="admin-input"
                value={settings.supportPhone}
                onChange={handleChange}
                placeholder="e.g. +61 2 1234 5678"
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
    organisationName: payload.settings.organisationName ?? 'Conveyancers Marketplace',
    organisationTagline: payload.settings.organisationTagline ?? 'Settlement workflows without friction',
    organisationLogo: payload.settings.organisationLogo ?? '',
    supportPhone: payload.settings.supportPhone ?? '',
  }

  return { props: { user, initialSettings } }
}

export default SettingsPage
