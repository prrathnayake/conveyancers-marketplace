import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import { FormEvent, useState } from 'react'

import { getSessionFromRequest } from '../../frontend/lib/session'

const AdminLoginPage = (): JSX.Element => {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading'>('idle')
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatus('loading')
    setError(null)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!response.ok) {
        throw new Error('invalid_credentials')
      }
      await router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error')
    } finally {
      setStatus('idle')
    }
  }

  return (
    <div className="admin-login">
      <Head>
        <title>Admin sign in</title>
      </Head>
      <form className="admin-login__card" onSubmit={handleSubmit}>
        <h1 className="admin-login__title">Administrator access</h1>
        <p className="admin-section__description">Multi-factor monitoring and audit trails guard every session.</p>
        <label className="admin-form__label" htmlFor="email">
          Email
          <input
            id="email"
            className="admin-input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="admin-form__label" htmlFor="password">
          Password
          <div className="password-field">
            <input
              id="password"
              className="admin-input password-field__input"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              className="password-field__toggle"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-pressed={showPassword}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>
        <button type="submit" className="admin-button" disabled={status === 'loading'}>
          {status === 'loading' ? 'Verifying…' : 'Enter control room'}
        </button>
        {error ? (
          <p className="admin-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  )
}

export const getServerSideProps: GetServerSideProps = async ({ req }) => {
  const user = getSessionFromRequest(req)
  if (user && user.role === 'admin') {
    return {
      redirect: {
        destination: '/',
        permanent: false,
      },
    }
  }

  return { props: {} }
}

export default AdminLoginPage
