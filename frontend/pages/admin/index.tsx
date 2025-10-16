import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import { ChangeEvent, useEffect, useState } from 'react'
import type { SessionUser } from '../../lib/session'
import { getSessionFromRequest } from '../../lib/session'

interface AdminProps {
  user: SessionUser
}

type Settings = {
  supportEmail?: string
  statusBanner?: string
}

const AdminPage = ({ user }: AdminProps): JSX.Element => {
  const [settings, setSettings] = useState<Settings>({})
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      const response = await fetch('/api/admin/settings', { signal: controller.signal })
      if (!response.ok) {
        return
      }
      const payload = (await response.json()) as { settings: Settings }
      setSettings(payload.settings)
    }
    void load()
    return () => controller.abort()
  }, [])

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target
    setSettings((prev) => ({ ...prev, [name]: value }))
  }

  const handleSave = async () => {
    setStatus('saving')
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      })
      if (!response.ok) {
        throw new Error('save_failed')
      }
      setStatus('saved')
    } catch (error) {
      console.error(error)
      setStatus('error')
    }
  }

  return (
    <>
      <Head>
        <title>Admin controls</title>
      </Head>
      <main className="page page--narrow">
        <section className="card" aria-labelledby="admin-heading">
          <h1 id="admin-heading">Platform configuration</h1>
          <p className="lead">
            Adjust tenant-wide messaging, status banners, and escalation contacts. All changes are audited against {user.email}.
          </p>
          <div className="form-grid">
            <label htmlFor="supportEmail" className="field-label">
              Support contact email
            </label>
            <input
              id="supportEmail"
              name="supportEmail"
              value={settings.supportEmail ?? ''}
              onChange={handleChange}
              className="input"
              type="email"
            />
            <label htmlFor="statusBanner" className="field-label">
              Status banner message
            </label>
            <textarea
              id="statusBanner"
              name="statusBanner"
              value={settings.statusBanner ?? ''}
              onChange={handleChange}
              className="input input--multiline"
              rows={3}
            />
            <button type="button" className="cta-primary" onClick={handleSave} disabled={status === 'saving'}>
              {status === 'saving' ? 'Saving…' : 'Update settings'}
            </button>
            {status === 'saved' ? <p className="status status--success">Settings updated.</p> : null}
            {status === 'error' ? <p className="status status--error">Unable to update settings.</p> : null}
          </div>
          <p className="meta">
            Access restricted. Admins can view sensitive audit trails; other roles cannot reach this area.
          </p>
        </section>
      </main>
    </>
  )
}

export const getServerSideProps: GetServerSideProps<AdminProps> = async ({ req }) => {
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

export default AdminPage
