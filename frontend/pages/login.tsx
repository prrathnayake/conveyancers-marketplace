import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { FormEvent, useState } from 'react'
import { useAuth } from '../context/AuthContext'

const LoginPage = (): JSX.Element => {
  const router = useRouter()
  const { refresh } = useAuth()
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
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? 'login_failed')
      }
      await refresh()
      await router.push('/chat')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error')
    } finally {
      setStatus('idle')
    }
  }

  return (
    <>
      <Head>
        <title>Secure login</title>
      </Head>
      <main className="page page--narrow">
        <section className="card" aria-labelledby="login-heading">
          <h1 id="login-heading">Access your workspace</h1>
          <p className="lead">Multi-factor alerts and anomaly detection keep every session monitored.</p>
          <form onSubmit={handleSubmit} className="form-grid">
            <label htmlFor="email" className="field-label">
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="input"
              required
              autoComplete="email"
            />
            <label htmlFor="password" className="field-label">
              Password
            </label>
            <div className="password-field">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="input password-field__input"
                required
                autoComplete="current-password"
                minLength={8}
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
            <button type="submit" className="cta-primary" disabled={status === 'loading'}>
              {status === 'loading' ? 'Signing in…' : 'Sign in securely'}
            </button>
          </form>
          {error ? <p className="status status--error">{error}</p> : null}
          <p className="meta">
            Need an account? <Link href="/signup">Create one</Link> to access conveyancing tools.
          </p>
        </section>
      </main>
    </>
  )
}

export default LoginPage
