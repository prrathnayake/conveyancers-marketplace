import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import { ChangeEvent, FormEvent, useState } from 'react'

import AdminLayout from '../components/AdminLayout'
import type { SessionUser } from '../../frontend/lib/session'
import { getSessionFromRequest } from '../../frontend/lib/session'

type ProfilePageProps = {
  user: SessionUser
}

type ProfileFormState = {
  fullName: string
  email: string
  currentPassword: string
  newPassword: string
  confirmNewPassword: string
}

type ProfileResponse =
  | { user: SessionUser }
  | { error: string }

type RequestStatus = 'idle' | 'saving'

const ERROR_MESSAGES: Record<string, string> = {
  missing_profile_fields: 'Please provide your name, email, and current password.',
  invalid_full_name: 'Full name must be between 2 and 120 characters.',
  invalid_email: 'Enter a valid email address.',
  invalid_current_password: 'Your current password was not accepted.',
  invalid_new_password: 'New password must be between 12 and 128 characters.',
  weak_new_password: 'New password must include both letters and numbers.',
  password_reuse: 'Choose a new password that differs from your current password.',
  email_in_use: 'Another account already uses this email address.',
  user_not_found: 'Account could not be located. Please sign in again.',
}

const ProfilePage = ({ user }: ProfilePageProps): JSX.Element => {
  const [profile, setProfile] = useState<SessionUser>(user)
  const [formState, setFormState] = useState<ProfileFormState>({
    fullName: user.fullName,
    email: user.email,
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  })
  const [status, setStatus] = useState<RequestStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const resetMessages = () => {
    setError(null)
    setSuccess(null)
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target
    setFormState((previous) => ({ ...previous, [name]: value }))
    resetMessages()
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    resetMessages()
    if (status === 'saving') {
      return
    }
    if (!formState.currentPassword.trim()) {
      setError('Enter your current password to verify the change.')
      return
    }
    if (formState.newPassword && formState.newPassword !== formState.confirmNewPassword) {
      setError('New password entries do not match.')
      return
    }

    setStatus('saving')
    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: formState.fullName.trim(),
          email: formState.email.trim(),
          currentPassword: formState.currentPassword,
          newPassword: formState.newPassword.trim() ? formState.newPassword : undefined,
        }),
      })
      const payload = (await response.json()) as ProfileResponse
      if (!response.ok || !('user' in payload)) {
        const message = 'error' in payload ? ERROR_MESSAGES[payload.error] ?? 'Unable to update profile.' : 'Unable to update profile.'
        throw new Error(message)
      }

      const nextUser = payload.user
      setProfile(nextUser)
      setFormState((previous) => ({
        ...previous,
        fullName: nextUser.fullName,
        email: nextUser.email,
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: '',
      }))
      setSuccess('Profile updated successfully.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update profile.')
    } finally {
      setStatus('idle')
    }
  }

  return (
    <AdminLayout user={profile}>
      <Head>
        <title>Account profile</title>
      </Head>
      <section className="admin-section" aria-labelledby="profile-heading">
        <header className="admin-section__header">
          <div>
            <h1 id="profile-heading" className="admin-section__title">
              Account profile
            </h1>
            <p className="admin-section__description">
              Manage the administrator identity, contact information, and authentication settings for this account.
            </p>
          </div>
        </header>
        <form className="admin-form" onSubmit={handleSubmit} noValidate>
          <fieldset>
            <legend>Identity</legend>
            <div className="admin-form__grid">
              <label className="admin-form__label" htmlFor="fullName">
                <span>Full name</span>
                <input
                  id="fullName"
                  name="fullName"
                  className="admin-input"
                  type="text"
                  required
                  minLength={2}
                  maxLength={120}
                  value={formState.fullName}
                  onChange={handleChange}
                  autoComplete="name"
                />
              </label>
              <label className="admin-form__label" htmlFor="email">
                <span>Work email</span>
                <input
                  id="email"
                  name="email"
                  className="admin-input"
                  type="email"
                  required
                  value={formState.email}
                  onChange={handleChange}
                  autoComplete="email"
                />
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend>Credentials</legend>
            <div className="admin-form__grid">
              <label className="admin-form__label" htmlFor="currentPassword">
                <span>Current password</span>
                <input
                  id="currentPassword"
                  name="currentPassword"
                  className="admin-input"
                  type="password"
                  required
                  minLength={8}
                  value={formState.currentPassword}
                  onChange={handleChange}
                  autoComplete="current-password"
                />
                <p className="admin-field__help">We require your current password to confirm any changes.</p>
              </label>
              <label className="admin-form__label" htmlFor="newPassword">
                <span>New password</span>
                <input
                  id="newPassword"
                  name="newPassword"
                  className="admin-input"
                  type="password"
                  minLength={12}
                  value={formState.newPassword}
                  onChange={handleChange}
                  autoComplete="new-password"
                  placeholder="Leave blank to keep existing password"
                />
                <p className="admin-field__help">Must be at least 12 characters and contain letters and numbers.</p>
              </label>
              <label className="admin-form__label" htmlFor="confirmNewPassword">
                <span>Confirm new password</span>
                <input
                  id="confirmNewPassword"
                  name="confirmNewPassword"
                  className="admin-input"
                  type="password"
                  minLength={12}
                  value={formState.confirmNewPassword}
                  onChange={handleChange}
                  autoComplete="new-password"
                  placeholder="Repeat new password"
                />
              </label>
            </div>
          </fieldset>
          <div className="admin-form__actions">
            <button type="submit" className="cta-primary" disabled={status === 'saving'}>
              {status === 'saving' ? 'Saving…' : 'Save changes'}
            </button>
            {success ? (
              <span className="admin-status admin-status--success" role="status">
                {success}
              </span>
            ) : null}
            {error ? (
              <span className="admin-status admin-status--error" role="alert">
                {error}
              </span>
            ) : null}
          </div>
        </form>
      </section>
    </AdminLayout>
  )
}

export const getServerSideProps: GetServerSideProps<ProfilePageProps> = async ({ req }) => {
  const user = getSessionFromRequest(req)
  if (!user || user.role !== 'admin') {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    }
  }

  return { props: { user } }
}

export default ProfilePage
