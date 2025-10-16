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
        <section className="admin-guidance" aria-label="Operational guardrails">
          <article id="access-control">
            <h2>Access control</h2>
            <p>
              Administrative actions require the <strong>X-API-Key</strong> header and a permitted <strong>X-Actor-Role</strong>
              . Tokens are rotated daily and revoked instantly from the identity service.
            </p>
            <ul>
              <li>Only users with the <code>finance_admin</code> or <code>conveyancer</code> role can move escrow funds.</li>
              <li>Seller and buyer roles are limited to read-only ledger queries.</li>
              <li>Each mutation is tagged with a request identifier and persisted to the audit timeline.</li>
            </ul>
          </article>
          <article id="data-ops">
            <h2>Data operations</h2>
            <p>
              This seeding workflow is safe to run multiple times thanks to idempotent SQL scripts and isolated schema
              namespaces. All writes are wrapped in transactions to guarantee rollbacks if validation fails.
            </p>
            <p className="note">Tip: run the seed from a bastion host to ensure network policies log the originating IP.</p>
          </article>
          <article id="audit-trails">
            <h2>Audit log</h2>
            <p>
              Backend services emit structured JSON logs that capture actor IDs, correlation IDs, and outcome codes. Export
              these logs to your SIEM via Fluent Bit or ship them directly to Cloud Logging.
            </p>
            <p>
              For investigations, join the audit timeline with payment ledger records using the <code>X-Request-Id</code>
              field forwarded by the gateway.
            </p>
          </article>
        </section>
      </main>
      <style jsx>{`
        .admin-guidance {
          display: grid;
          gap: 2rem;
          padding: 0 0 3rem;
        }

        .admin-guidance article {
          background: rgba(15, 23, 42, 0.04);
          border-radius: 18px;
          padding: 1.75rem;
          border: 1px solid rgba(148, 163, 184, 0.2);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
        }

        .admin-guidance h2 {
          margin-top: 0;
          color: #0f172a;
        }

        .admin-guidance p {
          color: #1f2937;
          line-height: 1.6;
        }

        .admin-guidance ul {
          margin: 1rem 0 0;
          padding-left: 1.25rem;
          color: #334155;
          line-height: 1.55;
        }

        .admin-guidance code {
          background: rgba(15, 23, 42, 0.08);
          padding: 0.1rem 0.35rem;
          border-radius: 6px;
          font-size: 0.9rem;
        }

        .note {
          margin-top: 0.75rem;
          font-size: 0.95rem;
          color: #2563eb;
        }

        @media (max-width: 720px) {
          .admin-guidance {
            padding-bottom: 2rem;
          }
        }
      `}</style>
    </>
  )
}

export default SeedPage
