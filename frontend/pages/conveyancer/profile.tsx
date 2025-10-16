import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import { ChangeEvent, useState } from 'react'
import type { SessionUser } from '../../lib/session'
import { getSessionFromRequest } from '../../lib/session'

interface ConveyancerProfileProps {
  user: SessionUser
  initialProfile: {
    firmName: string
    bio: string
    phone: string
    state: string
    website: string
  }
}

const ConveyancerProfilePage = ({ user, initialProfile }: ConveyancerProfileProps): JSX.Element => {
  const [profile, setProfile] = useState(initialProfile)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target
    setProfile((prev) => ({ ...prev, [name]: value }))
  }

  const handleSave = async () => {
    setStatus('saving')
    try {
      const response = await fetch('/api/conveyancers/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
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
        <title>Conveyancer profile</title>
      </Head>
      <main className="page page--narrow">
        <section className="card" aria-labelledby="profile-heading">
          <h1 id="profile-heading">Public profile</h1>
          <p className="lead">
            Keep your conveyancing credentials current so buyers and sellers can verify your expertise instantly.
          </p>
          <div className="form-grid">
            <label htmlFor="firmName" className="field-label">
              Firm name
            </label>
            <input id="firmName" name="firmName" value={profile.firmName} onChange={handleChange} className="input" />
            <label htmlFor="state" className="field-label">
              Practising state
            </label>
            <input id="state" name="state" value={profile.state} onChange={handleChange} className="input" />
            <label htmlFor="phone" className="field-label">
              Contact phone
            </label>
            <input id="phone" name="phone" value={profile.phone} onChange={handleChange} className="input" />
            <label htmlFor="website" className="field-label">
              Website
            </label>
            <input id="website" name="website" value={profile.website} onChange={handleChange} className="input" />
            <label htmlFor="bio" className="field-label">
              Bio
            </label>
            <textarea
              id="bio"
              name="bio"
              value={profile.bio}
              onChange={handleChange}
              className="input input--multiline"
              rows={4}
            />
            <button type="button" className="cta-primary" onClick={handleSave} disabled={status === 'saving'}>
              {status === 'saving' ? 'Saving…' : 'Publish profile'}
            </button>
            {status === 'saved' ? <p className="status status--success">Profile updated.</p> : null}
            {status === 'error' ? <p className="status status--error">Unable to update profile.</p> : null}
          </div>
          <aside className="note">
            Signed in as {user.fullName}. Profile updates are logged with immutable audit events for regulator compliance.
          </aside>
        </section>
      </main>
    </>
  )
}

export const getServerSideProps: GetServerSideProps<ConveyancerProfileProps> = async ({ req }) => {
  const user = getSessionFromRequest(req)
  if (!user || (user.role !== 'conveyancer' && user.role !== 'admin')) {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    }
  }
  const protocol = req.headers['x-forwarded-proto'] ?? 'http'
  const host = req.headers.host ?? 'localhost:5173'
  const response = await fetch(`${protocol}://${host}/api/conveyancers/profile`, {
    headers: { cookie: req.headers.cookie ?? '' },
  })
  const payload = (await response.json()) as ConveyancerProfileProps['initialProfile']
  return {
    props: {
      user,
      initialProfile: payload,
    },
  }
}

export default ConveyancerProfilePage
