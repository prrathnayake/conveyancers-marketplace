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
        <h1>Administrator access</h1>
        <p>Multi-factor monitoring and audit trails guard every session.</p>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={8}
          required
        />
        <button type="submit" disabled={status === 'loading'}>
          {status === 'loading' ? 'Verifying…' : 'Enter control room'}
        </button>
        {error ? <p className="error">{error}</p> : null}
      </form>
      <style jsx>{`
        .admin-login {
          min-height: 100vh;
          display: grid;
          place-items: center;
          background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(15, 23, 42, 0.92)),
            radial-gradient(circle at top left, rgba(37, 99, 235, 0.35), transparent 55%);
        }

        .admin-login__card {
          width: min(420px, 92vw);
          background: rgba(15, 23, 42, 0.85);
          border-radius: 24px;
          padding: 2.5rem;
          display: grid;
          gap: 1rem;
          border: 1px solid rgba(148, 163, 184, 0.25);
          box-shadow: 0 35px 80px rgba(15, 23, 42, 0.6);
          color: #e2e8f0;
        }

        h1 {
          margin: 0;
          font-size: 2rem;
          color: #f8fafc;
        }

        label {
          font-size: 0.9rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: rgba(148, 163, 184, 0.88);
        }

        input {
          width: 100%;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.3);
          background: rgba(15, 23, 42, 0.6);
          padding: 0.85rem 1rem;
          color: #f8fafc;
        }

        button {
          border: none;
          border-radius: 12px;
          padding: 0.9rem 1.5rem;
          font-weight: 600;
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          color: #f8fafc;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        button:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 20px 35px rgba(37, 99, 235, 0.35);
        }

        .error {
          margin: 0.5rem 0 0;
          color: #fecaca;
        }
      `}</style>
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
