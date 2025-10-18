import Head from 'next/head'
import Link from 'next/link'
import type { GetServerSideProps } from 'next'
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import type { SessionUser } from '../../lib/session'
import { getSessionFromRequest } from '../../lib/session'
import type { VerificationSummary } from '../../lib/verification'

interface AccountProps {
  user: SessionUser
}

const AccountPage = ({ user }: AccountProps): JSX.Element => {
  const { user: authUser, refresh: refreshSession } = useAuth()
  const effectiveUser = authUser ?? user
  const [fullName, setFullName] = useState(effectiveUser.fullName)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [verificationSummary, setVerificationSummary] = useState<VerificationSummary>(effectiveUser.verification)
  const [verificationMessage, setVerificationMessage] = useState<
    | { channel: 'email' | 'phone'; tone: 'success' | 'error'; text: string }
    | null
  >(null)
  const [verificationLoading, setVerificationLoading] = useState(false)
  const [emailCode, setEmailCode] = useState('')
  const [phoneCode, setPhoneCode] = useState('')
  const [phoneInput, setPhoneInput] = useState(effectiveUser.phone ?? '')
  const [devCodes, setDevCodes] = useState<{ email?: string; phone?: string }>({})
  const [profileImage, setProfileImage] = useState<string | null>(effectiveUser.profileImageUrl)
  const [photoStatus, setPhotoStatus] = useState<'idle' | 'uploading' | 'error' | 'success'>('idle')
  const [photoMessage, setPhotoMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setFullName(effectiveUser.fullName)
    setProfileImage(effectiveUser.profileImageUrl)
    setVerificationSummary(effectiveUser.verification)
  }, [effectiveUser.fullName, effectiveUser.profileImageUrl, effectiveUser.verification])

  useEffect(() => {
    setPhoneInput(verificationSummary.phone.phoneNumber ?? '')
  }, [verificationSummary.phone.phoneNumber])

  const formatTimestamp = (value: string | null): string => {
    if (!value) {
      return 'Pending'
    }
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return value
    }
    return date.toLocaleString()
  }

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
      await refreshSession()
    } catch (error) {
      console.error(error)
      setStatus('error')
    }
  }

  const handlePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    if (!file.type.startsWith('image/')) {
      setPhotoStatus('error')
      setPhotoMessage('Please choose an image file (PNG, JPG, or WebP).')
      return
    }
    if (file.size > 512 * 1024) {
      setPhotoStatus('error')
      setPhotoMessage('Profile photos must be smaller than 512 KB.')
      return
    }
    const reader = new FileReader()
    reader.onload = async () => {
      const result = reader.result
      if (typeof result !== 'string') {
        setPhotoStatus('error')
        setPhotoMessage('Unable to read the selected file.')
        return
      }
      setPhotoStatus('uploading')
      setPhotoMessage(null)
      try {
        const response = await fetch('/api/users/profile-picture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: result }),
        })
        const payload = (await response.json().catch(() => null)) as { image?: string; error?: string } | null
        if (!response.ok || !payload?.image) {
          throw new Error(payload?.error ?? 'upload_failed')
        }
        setProfileImage(payload.image)
        setPhotoStatus('success')
        setPhotoMessage('Profile photo updated successfully.')
        await refreshSession()
      } catch (error) {
        console.error('Failed to upload profile image', error)
        setPhotoStatus('error')
        setPhotoMessage('We could not upload this image. Please try again.')
      }
    }
    reader.readAsDataURL(file)
  }

  const handleRemovePhoto = async () => {
    setPhotoStatus('uploading')
    setPhotoMessage(null)
    try {
      const response = await fetch('/api/users/profile-picture', { method: 'DELETE' })
      if (!response.ok) {
        throw new Error('delete_failed')
      }
      setProfileImage(null)
      setPhotoStatus('success')
      setPhotoMessage('Profile photo removed.')
      await refreshSession()
    } catch (error) {
      console.error('Failed to remove profile image', error)
      setPhotoStatus('error')
      setPhotoMessage('Unable to remove the profile photo. Please retry.')
    }
  }

  const handleVerificationRequest = async (channel: 'email' | 'phone') => {
    if (verificationLoading) {
      return
    }
    if (channel === 'phone') {
      const trimmed = phoneInput.trim()
      if (!trimmed) {
        setVerificationMessage({
          channel: 'phone',
          tone: 'error',
          text: 'Enter a mobile number before requesting a code.',
        })
        return
      }
    }
    setVerificationLoading(true)
    setVerificationMessage(null)
    try {
      const body: Record<string, string> = { channel }
      if (channel === 'phone') {
        body.phone = phoneInput.trim()
      }
      const response = await fetch('/api/verification/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; verification?: VerificationSummary; debugCode?: string; error?: string }
        | null
      if (!response.ok || !payload?.ok || !payload.verification) {
        const code = payload?.error ?? 'verification_issue_failed'
        const friendly =
          code === 'invalid_phone'
            ? 'Enter a valid mobile number with country code.'
            : code === 'rate_limited'
            ? 'Please wait a moment before requesting another code.'
            : 'Unable to send a new code right now.'
        throw new Error(friendly)
      }
      setVerificationSummary(payload.verification)
      if (process.env.NODE_ENV !== 'production' && payload.debugCode) {
        setDevCodes((prev) => ({ ...prev, [channel]: payload.debugCode }))
      }
      setVerificationMessage({
        channel,
        tone: 'success',
        text: channel === 'email' ? 'Email code sent. Check your inbox.' : 'SMS code sent to your mobile.',
      })
    } catch (error) {
      console.error('Failed to request verification code', error)
      setVerificationMessage({
        channel,
        tone: 'error',
        text: error instanceof Error ? error.message : 'Unable to send a new code right now.',
      })
    } finally {
      setVerificationLoading(false)
    }
  }

  const handleVerificationSubmit = async (
    event: FormEvent<HTMLFormElement>,
    channel: 'email' | 'phone',
    code: string,
    reset: (value: string) => void
  ) => {
    event.preventDefault()
    if (verificationLoading) {
      return
    }
    setVerificationLoading(true)
    setVerificationMessage(null)
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
      setVerificationSummary(payload.verification)
      reset('')
      setVerificationMessage({ channel, tone: 'success', text: 'Verification confirmed.' })
      await refreshSession()
    } catch (error) {
      console.error('Failed to verify code', error)
      setVerificationMessage({ channel, tone: 'error', text: 'Invalid or expired code. Request a new one.' })
    } finally {
      setVerificationLoading(false)
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
            <input value={effectiveUser.email} disabled className="input" />
            <label className="field-label">Role</label>
            <input value={effectiveUser.role} disabled className="input" />
            <label className="field-label">Mobile number</label>
            <input value={effectiveUser.phone ?? ''} disabled className="input" />
            <button type="button" className="cta-primary" onClick={handleSave} disabled={status === 'saving'}>
              {status === 'saving' ? 'Saving…' : 'Save changes'}
            </button>
            {status === 'saved' ? <p className="status status--success">Changes saved.</p> : null}
            {status === 'error' ? (
              <p className="status status--error">We could not save your details. Please retry.</p>
            ) : null}
          </div>
          <div className="profile-photo-uploader">
            <div className="profile-photo-preview" aria-live="polite">
              {profileImage ? (
                <img src={profileImage} alt="Profile" />
              ) : (
                <span aria-hidden="true">{effectiveUser.fullName.charAt(0)}</span>
              )}
            </div>
            <div className="profile-photo-actions">
              <label htmlFor="profile-photo" className="field-label">
                Profile photo
              </label>
              <input
                id="profile-photo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handlePhotoChange}
                className="input"
                style={{ display: 'none' }}
                ref={fileInputRef}
              />
              <div className="profile-photo-buttons">
                <button
                  type="button"
                  className="cta-secondary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload new photo
                </button>
                <button type="button" className="cta-link" onClick={handleRemovePhoto} disabled={!profileImage}>
                  Remove photo
                </button>
              </div>
              {photoStatus === 'uploading' ? <p className="meta">Uploading…</p> : null}
              {photoMessage ? (
                <p className={`status status--${photoStatus === 'error' ? 'error' : 'success'}`}>{photoMessage}</p>
              ) : null}
              <p className="meta">PNG, JPG, or WebP up to 512 KB.</p>
            </div>
          </div>
          <section className="card-section">
            <h2>Verification status</h2>
            <ul className="meta-list">
              <li>
                Email: <strong>{verificationSummary.email.verified ? 'Verified' : 'Pending'}</strong>
                {!verificationSummary.email.verified
                  ? null
                  : ` · ${formatTimestamp(verificationSummary.email.verifiedAt)}`}
              </li>
              <li>
                Mobile: <strong>{verificationSummary.phone.verified ? 'Verified' : 'Pending'}</strong>
                {!verificationSummary.phone.verified
                  ? null
                  : ` · ${formatTimestamp(verificationSummary.phone.verifiedAt)}`}
              </li>
              {verificationSummary.conveyancing.required ? (
                <li>
                  Conveyancing licence: <strong>{verificationSummary.conveyancing.status}</strong>
                </li>
              ) : null}
            </ul>
            {verificationSummary.overallVerified ? (
              <p className="status status--success">Your account is fully verified.</p>
            ) : (
              <p className="status status--error">
                Verification outstanding. <Link href="/account/verify">Complete verification now.</Link>
              </p>
            )}
            <div className="verification-inline" aria-live="polite">
              <section className="verification-inline__block">
                <header className="verification-inline__header">
                  <h3>Email verification</h3>
                  <p className="meta">
                    Status: {verificationSummary.email.verified ? 'Verified' : 'Pending'}
                  </p>
                </header>
                {verificationSummary.email.verified ? (
                  <p className="meta">Verified on {formatTimestamp(verificationSummary.email.verifiedAt)}</p>
                ) : (
                  <>
                    <div className="verification-inline__actions">
                      <button
                        type="button"
                        className="cta-secondary"
                        onClick={() => void handleVerificationRequest('email')}
                        disabled={verificationLoading}
                      >
                        Send email code
                      </button>
                    </div>
                    <form
                      className="verification-form verification-inline__form"
                      onSubmit={(event) => handleVerificationSubmit(event, 'email', emailCode, setEmailCode)}
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
                      <button type="submit" className="cta-primary" disabled={verificationLoading}>
                        Verify email
                      </button>
                    </form>
                    {devCodes.email ? <p className="meta">Development code: {devCodes.email}</p> : null}
                  </>
                )}
                {verificationMessage?.channel === 'email' ? (
                  <p className={`status status--${verificationMessage.tone}`}>{verificationMessage.text}</p>
                ) : null}
              </section>
              <section className="verification-inline__block">
                <header className="verification-inline__header">
                  <h3>Mobile verification</h3>
                  <p className="meta">
                    Status: {verificationSummary.phone.verified ? 'Verified' : 'Pending'}
                  </p>
                </header>
                {verificationSummary.phone.verified ? (
                  <p className="meta">Verified on {formatTimestamp(verificationSummary.phone.verifiedAt)}</p>
                ) : (
                  <>
                    <label htmlFor="phone-number" className="field-label">
                      Mobile number
                    </label>
                    <input
                      id="phone-number"
                      className="input"
                      value={phoneInput}
                      onChange={(event) => setPhoneInput(event.target.value)}
                      placeholder="+61 400 000 000"
                    />
                    <div className="verification-inline__actions">
                      <button
                        type="button"
                        className="cta-secondary"
                        onClick={() => void handleVerificationRequest('phone')}
                        disabled={verificationLoading}
                      >
                        Send SMS code
                      </button>
                    </div>
                    <form
                      className="verification-form verification-inline__form"
                      onSubmit={(event) => handleVerificationSubmit(event, 'phone', phoneCode, setPhoneCode)}
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
                      <button type="submit" className="cta-primary" disabled={verificationLoading}>
                        Verify mobile
                      </button>
                    </form>
                    {devCodes.phone ? <p className="meta">Development code: {devCodes.phone}</p> : null}
                  </>
                )}
                {verificationMessage?.channel === 'phone' ? (
                  <p className={`status status--${verificationMessage.tone}`}>{verificationMessage.text}</p>
                ) : null}
              </section>
            </div>
          </section>
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
