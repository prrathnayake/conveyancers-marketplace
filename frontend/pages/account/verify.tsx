import Head from 'next/head'
import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'

import type { VerificationSummary } from '../../lib/verification'
import { useAuth } from '../../context/AuthContext'

const formatStatus = (verified: boolean): string => (verified ? 'Verified' : 'Pending verification')

const VerifyAccountPage = (): JSX.Element => {
  const { refresh } = useAuth()
  const [summary, setSummary] = useState<VerificationSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [emailCode, setEmailCode] = useState('')
  const [phoneCode, setPhoneCode] = useState('')
  const [phoneInput, setPhoneInput] = useState('')
  const [messages, setMessages] = useState<{ channel: string; text: string; tone: 'success' | 'error' } | null>(null)
  const [devCodes, setDevCodes] = useState<{ email?: string; phone?: string }>({})
  const [govForm, setGovForm] = useState({ licenceNumber: '', state: '', businessName: '' })
  const [govStatus, setGovStatus] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null)

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const response = await fetch('/api/verification/status')
        if (!response.ok) {
          throw new Error('status_failed')
        }
        const payload = (await response.json()) as { verification: VerificationSummary }
        setSummary(payload.verification)
      } catch (error) {
        console.error('Failed to load verification status', error)
      } finally {
        setLoading(false)
      }
    }
    void loadStatus()
  }, [])

  useEffect(() => {
    if (summary) {
      setPhoneInput(summary.phone.phoneNumber ?? '')
    }
  }, [summary?.phone.phoneNumber])

  const handleRequest = async (channel: 'email' | 'phone', options?: { phone?: string }) => {
    setMessages(null)
    try {
      const response = await fetch('/api/verification/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, ...(options ?? {}) }),
      })
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; verification?: VerificationSummary; debugCode?: string; error?: string }
        | null
      if (!response.ok || !payload?.ok || !payload.verification) {
        const code = payload?.error ?? 'request_failed'
        const friendly =
          code === 'invalid_phone'
            ? 'Enter a valid mobile number with country code.'
            : code === 'rate_limited'
            ? 'Please wait a moment before requesting another code.'
            : 'Unable to send a new code right now.'
        throw new Error(friendly)
      }
      setSummary(payload.verification)
      if (process.env.NODE_ENV !== 'production' && payload.debugCode) {
        setDevCodes((prev) => ({ ...prev, [channel]: payload.debugCode }))
      }
      setMessages({ channel, tone: 'success', text: 'Code sent. Check your inbox or device.' })
    } catch (error) {
      console.error('Failed to issue verification code', error)
      setMessages({
        channel,
        tone: 'error',
        text: error instanceof Error ? error.message : 'Unable to send a new code right now.',
      })
    }
  }

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
    channel: 'email' | 'phone',
    code: string,
    reset: (value: string) => void
  ) => {
    event.preventDefault()
    setMessages(null)
    try {
      const response = await fetch('/api/verification/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, code }),
      })
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; verification?: VerificationSummary; error?: string }
        | null
      if (!response.ok || !payload?.ok || !payload.verification) {
        throw new Error(payload?.error ?? 'verify_failed')
      }
      setSummary(payload.verification)
      reset('')
      setMessages({ channel, tone: 'success', text: 'Verification confirmed.' })
      await refresh()
    } catch (error) {
      console.error('Failed to verify code', error)
      setMessages({ channel, tone: 'error', text: 'Invalid or expired code. Request a new one.' })
    }
  }

  const handleGovSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setGovStatus({ tone: 'info', text: 'Submitting licence for verification…' })
    try {
      const response = await fetch('/api/verification/conveyancing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(govForm),
      })
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; status?: string; reason?: string | null; verification?: VerificationSummary }
        | null
      if (!response.ok || !payload?.verification) {
        throw new Error(payload?.reason ?? 'gov_failed')
      }
      setSummary(payload.verification)
      if (payload.ok) {
        setGovStatus({ tone: 'success', text: 'Licence verified with Australian registers.' })
      } else {
        setGovStatus({ tone: 'error', text: payload.reason ?? 'Licence could not be approved.' })
      }
      await refresh()
    } catch (error) {
      console.error('Failed to submit conveyancing verification', error)
      setGovStatus({ tone: 'error', text: 'Unable to verify licence. Try again or contact support.' })
    }
  }

  return (
    <>
      <Head>
        <title>Verify your account</title>
      </Head>
      <main className="page page--narrow">
        <section className="card" aria-labelledby="verify-heading">
          <h1 id="verify-heading">Verify your contact details</h1>
          <p className="lead">
            Complete verification of your email, mobile number, and professional credentials to unlock secure messaging and job
            workflows.
          </p>
          {loading ? (
            <p>Loading verification status…</p>
          ) : summary ? (
            <div className="verification-grid">
              <article className="verification-card" aria-labelledby="email-verify-heading">
                <h2 id="email-verify-heading">Email verification</h2>
                <p className="verification-status" data-state={summary.email.verified ? 'verified' : 'pending'}>
                  {formatStatus(summary.email.verified)}
                </p>
                {summary.email.verified ? (
                  <p className="meta">Verified on {summary.email.verifiedAt ? new Date(summary.email.verifiedAt).toLocaleString() : 'recorded timestamp'}.</p>
                ) : (
                  <>
                    <button type="button" className="cta-secondary" onClick={() => void handleRequest('email')}>
                      Send email code
                    </button>
                    <form
                      className="verification-form"
                      onSubmit={(event) => handleSubmit(event, 'email', emailCode, setEmailCode)}
                    >
                      <label htmlFor="email-code" className="field-label">
                        Enter 6-digit code
                      </label>
                      <input
                        id="email-code"
                        value={emailCode}
                        onChange={(event) => setEmailCode(event.target.value)}
                        className="input"
                        pattern="[0-9]{6}"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        required
                      />
                      <button type="submit" className="cta-primary">
                        Verify email
                      </button>
                    </form>
                    {devCodes.email ? <p className="meta">Development code: {devCodes.email}</p> : null}
                  </>
                )}
                {messages && messages.channel === 'email' ? (
                  <p className={`status status--${messages.tone}`}>{messages.text}</p>
                ) : null}
              </article>
              <article className="verification-card" aria-labelledby="phone-verify-heading">
                <h2 id="phone-verify-heading">Mobile verification</h2>
                <p className="verification-status" data-state={summary.phone.verified ? 'verified' : 'pending'}>
                  {formatStatus(summary.phone.verified)}
                </p>
                <p className="meta">Current number: {summary.phone.phoneNumber ?? 'Not provided'}</p>
                {summary.phone.verified ? (
                  <p className="meta">Verified on {summary.phone.verifiedAt ? new Date(summary.phone.verifiedAt).toLocaleString() : 'recorded timestamp'}.</p>
                ) : (
                  <>
                    <label htmlFor="phone-number" className="field-label">
                      Update mobile number
                    </label>
                    <input
                      id="phone-number"
                      className="input"
                      value={phoneInput}
                      onChange={(event) => setPhoneInput(event.target.value)}
                      placeholder="+61 400 000 000"
                    />
                    <button
                      type="button"
                      className="cta-secondary"
                      onClick={() => void handleRequest('phone', { phone: phoneInput.trim() })}
                    >
                      Send SMS code
                    </button>
                    <form
                      className="verification-form"
                      onSubmit={(event) => handleSubmit(event, 'phone', phoneCode, setPhoneCode)}
                    >
                      <label htmlFor="phone-code" className="field-label">
                        Enter 6-digit code
                      </label>
                      <input
                        id="phone-code"
                        value={phoneCode}
                        onChange={(event) => setPhoneCode(event.target.value)}
                        className="input"
                        pattern="[0-9]{6}"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        required
                      />
                      <button type="submit" className="cta-primary">
                        Verify number
                      </button>
                    </form>
                    {devCodes.phone ? <p className="meta">Development code: {devCodes.phone}</p> : null}
                  </>
                )}
                {messages && messages.channel === 'phone' ? (
                  <p className={`status status--${messages.tone}`}>{messages.text}</p>
                ) : null}
              </article>
              {summary.conveyancing.required ? (
                <article className="verification-card" aria-labelledby="gov-verify-heading">
                  <h2 id="gov-verify-heading">Conveyancing licence</h2>
                  <p className="verification-status" data-state={summary.conveyancing.status === 'approved' ? 'verified' : 'pending'}>
                    {summary.conveyancing.status === 'approved'
                      ? 'Approved by Australian registers'
                      : 'Additional verification required'}
                  </p>
                  {summary.conveyancing.reference ? (
                    <p className="meta">Reference: {summary.conveyancing.reference}</p>
                  ) : null}
                  {summary.conveyancing.reason && summary.conveyancing.status === 'declined' ? (
                    <p className="status status--error">{summary.conveyancing.reason}</p>
                  ) : null}
                  {summary.conveyancing.status === 'approved' && summary.conveyancing.verifiedAt ? (
                    <p className="meta">Verified at {new Date(summary.conveyancing.verifiedAt).toLocaleString()}.</p>
                  ) : (
                    <form className="verification-form" onSubmit={handleGovSubmit}>
                      <label htmlFor="licenceNumber" className="field-label">
                        Licence number
                      </label>
                      <input
                        id="licenceNumber"
                        name="licenceNumber"
                        className="input"
                        required
                        value={govForm.licenceNumber}
                        onChange={(event) => setGovForm((prev) => ({ ...prev, licenceNumber: event.target.value }))}
                      />
                      <label htmlFor="licenceState" className="field-label">
                        Issuing state/territory
                      </label>
                      <input
                        id="licenceState"
                        name="state"
                        className="input"
                        required
                        value={govForm.state}
                        onChange={(event) => setGovForm((prev) => ({ ...prev, state: event.target.value }))}
                        placeholder="e.g. VIC"
                      />
                      <label htmlFor="businessName" className="field-label">
                        Business or trading name (optional)
                      </label>
                      <input
                        id="businessName"
                        name="businessName"
                        className="input"
                        value={govForm.businessName}
                        onChange={(event) => setGovForm((prev) => ({ ...prev, businessName: event.target.value }))}
                      />
                      <button type="submit" className="cta-primary">
                        Submit to registry
                      </button>
                    </form>
                  )}
                  {govStatus ? <p className={`status status--${govStatus.tone}`}>{govStatus.text}</p> : null}
                </article>
              ) : null}
            </div>
          ) : (
            <p role="alert">We could not determine your verification status.</p>
          )}
          <footer className="card-footer">
            <p className="meta">
              Once all checks are complete you will have full access to escrow, jobs, and MatterGuard messaging. Need help?
              Contact <Link href="/contact-us">support</Link> with your verification reference.
            </p>
          </footer>
        </section>
      </main>
    </>
  )
}

export default VerifyAccountPage
