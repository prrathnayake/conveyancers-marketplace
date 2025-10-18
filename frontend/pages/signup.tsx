import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { ChangeEvent, FormEvent, useState } from 'react'
import { useAuth } from '../context/AuthContext'

const SignupPage = (): JSX.Element => {
  const router = useRouter()
  const { refresh } = useAuth()
  const [form, setForm] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'buyer',
    phone: '',
  })
  const [status, setStatus] = useState<'idle' | 'loading'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatus('loading')
    setError(null)
    const errorMessages: Record<string, string> = {
      email_in_use: 'This email is already registered.',
      invalid_phone: 'Enter a valid mobile number with an area or country code.',
      weak_password: 'Choose a stronger password (minimum eight characters).',
    }
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        const code = payload?.error ?? 'signup_failed'
        throw new Error(errorMessages[code] ?? 'We could not create your account. Please try again.')
      }
      await refresh()
      await router.push('/account/verify')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error')
    } finally {
      setStatus('idle')
    }
  }

  return (
    <>
      <Head>
        <title>Create account</title>
      </Head>
      <main className="page page--narrow">
        <section className="card" aria-labelledby="signup-heading">
          <h1 id="signup-heading">Create a secure workspace</h1>
          <p className="lead">
            Accounts are protected by role-based access control and encrypted chat for document sharing.
          </p>
          <form onSubmit={handleSubmit} className="form-grid">
            <label htmlFor="fullName" className="field-label">
              Full name
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              value={form.fullName}
              onChange={handleChange}
              className="input"
              required
              autoComplete="name"
            />
            <label htmlFor="email" className="field-label">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
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
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={handleChange}
                className="input password-field__input"
                required
                minLength={8}
                autoComplete="new-password"
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
            <label htmlFor="phone" className="field-label">
              Mobile number
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              value={form.phone}
              onChange={handleChange}
              className="input"
              required
              autoComplete="tel"
              placeholder="e.g. +61 400 000 000"
            />
            <label htmlFor="role" className="field-label">
              Role
            </label>
            <select id="role" name="role" value={form.role} onChange={handleChange} className="input">
              <option value="buyer">Buyer</option>
              <option value="seller">Seller</option>
              <option value="conveyancer">Conveyancer</option>
            </select>
            <button type="submit" className="cta-primary" disabled={status === 'loading'}>
              {status === 'loading' ? 'Creating…' : 'Create secure account'}
            </button>
          </form>
          {error ? <p className="status status--error">{error}</p> : null}
          <p className="meta">
            Already registered? <Link href="/login">Sign in</Link> instead.
          </p>
        </section>
      </main>
    </>
  )
}

export default SignupPage
