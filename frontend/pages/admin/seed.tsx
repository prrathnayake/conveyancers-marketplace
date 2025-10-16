import Head from 'next/head'
import { useState } from 'react'

const SeedPage = (): JSX.Element => {
  const [token, setToken] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleSeed = async () => {
    setStatus('loading')
    setError(null)
    try {
      const response = await fetch('/api/dev/seed', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.trim()}`,
        },
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? 'seed_failed')
      }
      setStatus('success')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Unexpected error')
    }
  }

  const disabled = status === 'loading' || !token.trim()

  return (
    <>
      <Head>
        <title>Developer data seeding</title>
      </Head>
      <main className="page page--narrow">
        <section className="card" aria-labelledby="seed-heading">
          <h1 id="seed-heading">Seed development data</h1>
          <p>
            Run the official SQL seed against your configured database. Provide a valid developer access token to continue.
          </p>
          <label htmlFor="token" className="field-label">
            Access token
          </label>
          <input
            id="token"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            className="input"
            placeholder="Enter developer token"
            autoComplete="off"
          />
          <button type="button" className="cta-primary" onClick={handleSeed} disabled={disabled}>
            {status === 'loading' ? 'Seeding…' : 'Run seed'}
          </button>
          {status === 'success' ? <p className="status status--success">Seed completed successfully.</p> : null}
          {status === 'error' ? (
            <p className="status status--error">Failed to run seed: {error ?? 'unknown error'}</p>
          ) : null}
        </section>
      </main>
    </>
  )
}

export default SeedPage
