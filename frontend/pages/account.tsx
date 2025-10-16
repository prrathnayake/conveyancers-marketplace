import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import { useState } from 'react'
import type { SessionUser } from '../lib/session'
import { getSessionFromRequest } from '../lib/session'

interface AccountProps {
  user: SessionUser
}

const AccountPage = ({ user }: AccountProps): JSX.Element => {
  const [fullName, setFullName] = useState(user.fullName)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const handleSave = async () => {
    setStatus('saving')
    try {
      const response = await fetch('/api/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName }),
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
        <title>Account security</title>
      </Head>
      <main className="page page--narrow">
        <section className="card" aria-labelledby="account-heading">
          <h1 id="account-heading">Account overview</h1>
          <p className="lead">
            Manage your identity data, update your display name, and see the role assigned to this workspace login.
          </p>
          <div className="form-grid">
            <label htmlFor="fullName" className="field-label">
              Display name
            </label>
            <input
              id="fullName"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="input"
            />
            <label className="field-label">Email</label>
            <input value={user.email} disabled className="input" />
            <label className="field-label">Role</label>
            <input value={user.role} disabled className="input" />
            <button type="button" className="cta-primary" onClick={handleSave} disabled={status === 'saving'}>
              {status === 'saving' ? 'Saving…' : 'Save changes'}
            </button>
            {status === 'saved' ? <p className="status status--success">Changes saved.</p> : null}
            {status === 'error' ? (
              <p className="status status--error">We could not save your details. Please retry.</p>
            ) : null}
          </div>
        </section>
      </main>
    </>
  )
}

export const getServerSideProps: GetServerSideProps<AccountProps> = async ({ req, res }) => {
  const user = getSessionFromRequest(req)
  if (!user) {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    }
  }
  return {
    props: {
      user,
    },
  }
}

export default AccountPage
