import Head from 'next/head'
import Link from 'next/link'
import type { GetServerSideProps } from 'next'
import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import type { SessionUser } from '../../lib/session'
import { getSessionFromRequest } from '../../lib/session'

interface AccountProps {
  user: SessionUser
}

const AccountPage = ({ user }: AccountProps): JSX.Element => {
  const { user: authUser, refresh: refreshSession } = useAuth()
  const effectiveUser = authUser ?? user
  const [fullName, setFullName] = useState(effectiveUser.fullName)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const { verification } = effectiveUser
  const [profileImage, setProfileImage] = useState<string | null>(effectiveUser.profileImageUrl)
  const [photoStatus, setPhotoStatus] = useState<'idle' | 'uploading' | 'error' | 'success'>('idle')
  const [photoMessage, setPhotoMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setFullName(effectiveUser.fullName)
    setProfileImage(effectiveUser.profileImageUrl)
  }, [effectiveUser.fullName, effectiveUser.profileImageUrl])

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
                Email: <strong>{verification.email.verified ? 'Verified' : 'Pending'}</strong>
              </li>
              <li>
                Mobile: <strong>{verification.phone.verified ? 'Verified' : 'Pending'}</strong>
              </li>
              {verification.conveyancing.required ? (
                <li>
                  Conveyancing licence: <strong>{verification.conveyancing.status}</strong>
                </li>
              ) : null}
            </ul>
            {verification.overallVerified ? (
              <p className="status status--success">Your account is fully verified.</p>
            ) : (
              <p className="status status--error">
                Verification outstanding. <Link href="/account/verify">Complete verification now.</Link>
              </p>
            )}
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
