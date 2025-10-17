import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import { FormEvent, useEffect, useMemo, useState } from 'react'

import AdminLayout from '../components/AdminLayout'
import type { SessionUser } from '../../frontend/lib/session'
import { getSessionFromRequest } from '../../frontend/lib/session'

type ManagedUser = {
  id: number
  email: string
  fullName: string
  role: SessionUser['role']
  status: 'active' | 'suspended' | 'invited'
  createdAt: string
  lastLoginAt: string | null
}

type UserFormState = {
  email: string
  fullName: string
  role: SessionUser['role']
  status: 'active' | 'suspended' | 'invited'
  password: string
}

type AdminUsersProps = {
  user: SessionUser
}

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) {
    return '—'
  }
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return value
    }
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  } catch {
    return value
  }
}

const emptyForm: UserFormState = {
  email: '',
  fullName: '',
  role: 'buyer',
  status: 'active',
  password: '',
}

const roleFormOptions: Array<{ value: ManagedUser['role']; label: string }> = [
  { value: 'buyer', label: 'Buyer' },
  { value: 'seller', label: 'Seller' },
  { value: 'conveyancer', label: 'Conveyancer' },
  { value: 'admin', label: 'Administrator' },
]

const roleLabelMap = roleFormOptions.reduce<Record<ManagedUser['role'], string>>((acc, option) => {
  acc[option.value] = option.label
  return acc
}, {} as Record<ManagedUser['role'], string>)

const roleFilterOptions: Array<{ value: 'all' | 'customer' | ManagedUser['role']; label: string }> = [
  { value: 'all', label: 'All roles' },
  { value: 'customer', label: 'Customers (buyers & sellers)' },
  ...roleFormOptions,
]

const statusOptions: Array<{ value: ManagedUser['status']; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'invited', label: 'Invited' },
]

const errorMessages: Record<string, string> = {
  email_in_use: 'This email is already associated with another account.',
  invalid_email: 'Enter a valid email address.',
  invalid_full_name: 'Provide a full name with at least two characters.',
  weak_password: 'Passwords must be at least 12 characters and include both letters and numbers.',
  invalid_role: 'Select a valid role for this user.',
  invalid_status: 'Choose a valid status for this user.',
  self_lockout: 'You cannot remove your own administrative access or suspend your own account.',
  admin_required: 'At least one active administrator must remain on the platform.',
  cannot_delete_self: 'You cannot delete your own account while signed in.',
  not_found: 'The requested user record could not be found.',
}

const resolveErrorMessage = (code: unknown, fallback: string): string => {
  if (typeof code === 'string' && errorMessages[code]) {
    return errorMessages[code]
  }
  return fallback
}

const AdminUsers = ({ user }: AdminUsersProps): JSX.Element => {
  const [records, setRecords] = useState<ManagedUser[]>([])
  const [filters, setFilters] = useState<{ role: 'all' | 'customer' | ManagedUser['role']; status: 'all' | ManagedUser['status'] }>(
    {
      role: 'all',
      status: 'all',
    }
  )
  const [formState, setFormState] = useState<UserFormState>(emptyForm)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null)

  const loadUsers = async (nextFilters = filters) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (nextFilters.role !== 'all') {
        params.set('role', nextFilters.role)
      }
      if (nextFilters.status !== 'all') {
        params.set('status', nextFilters.status)
      }
      const response = await fetch(`/api/users${params.toString() ? `?${params.toString()}` : ''}`)
      if (!response.ok) {
        throw new Error('Unable to load users')
      }
      const payload = (await response.json()) as ManagedUser[]
      setRecords(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadUsers(filters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.role, filters.status])

  const resetForm = () => {
    setSelectedId(null)
    setFormState(emptyForm)
    setShowPassword(false)
    setGeneratedPassword(null)
  }

  const selectedUser = useMemo(() => records.find((record) => record.id === selectedId) ?? null, [records, selectedId])

  useEffect(() => {
    if (selectedUser) {
      setFormState({
        email: selectedUser.email,
        fullName: selectedUser.fullName,
        role: selectedUser.role,
        status: selectedUser.status,
        password: '',
      })
      setShowPassword(false)
    } else {
      setFormState(emptyForm)
      setGeneratedPassword(null)
    }
  }, [selectedUser])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)
    setGeneratedPassword(null)
    try {
      if (selectedId) {
        const payload: Record<string, unknown> = {
          id: selectedId,
          fullName: formState.fullName,
          role: formState.role,
          status: formState.status,
        }
        if (formState.email !== selectedUser?.email) {
          payload.email = formState.email
        }
        if (formState.password) {
          if (formState.password.length < 12) {
            throw new Error('New passwords must be at least 12 characters long')
          }
          payload.password = formState.password
        }
        const response = await fetch('/api/users', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const result = (await response.json().catch(() => null)) as { error?: string; password?: string } | null
        if (!response.ok) {
          throw new Error(resolveErrorMessage(result?.error, 'Unable to update user'))
        }
        if (result?.password) {
          setGeneratedPassword(result.password)
        }
        setSuccess('User updated successfully')
      } else {
        if (!formState.password || formState.password.length < 12) {
          throw new Error('Temporary passwords must be at least 12 characters long')
        }
        const response = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formState.email,
            fullName: formState.fullName,
            role: formState.role,
            password: formState.password,
            status: formState.status,
          }),
        })
        const result = (await response.json().catch(() => null)) as { error?: string } | null
        if (!response.ok) {
          throw new Error(resolveErrorMessage(result?.error, 'Unable to create user'))
        }
        setSuccess('User created successfully')
      }
      await loadUsers()
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save user')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this user account? This action cannot be undone.')) {
      return
    }
    setLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(`/api/users?id=${id}`, { method: 'DELETE' })
      const result = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        throw new Error(resolveErrorMessage(result?.error, 'Unable to delete user'))
      }
      setSuccess('User deleted successfully')
      await loadUsers()
      if (selectedId === id) {
        resetForm()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete user')
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (id: number) => {
    setLoading(true)
    setError(null)
    setSuccess(null)
    setGeneratedPassword(null)
    try {
      const response = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, resetPassword: true }),
      })
      const result = (await response.json().catch(() => null)) as { error?: string; password?: string } | null
      if (!response.ok) {
        throw new Error(resolveErrorMessage(result?.error, 'Unable to reset password'))
      }
      if (result?.password) {
        setGeneratedPassword(result.password)
        setSuccess('A temporary password was generated for this user')
      } else {
        setSuccess('Password reset successfully')
      }
      await loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AdminLayout user={user}>
      <Head>
        <title>Manage customers</title>
      </Head>
      <section className="admin-section" aria-labelledby="users-heading">
        <header className="admin-section__header">
          <div>
            <h1 id="users-heading" className="admin-section__title">
              Customer accounts
            </h1>
            <p className="admin-section__description">
              Provision, suspend, or update any marketplace participant across buyer, seller, conveyancer, or admin roles.
            </p>
          </div>
          <button type="button" className="admin-button admin-button--ghost" onClick={resetForm}>
            Create new user
          </button>
        </header>
        {error ? (
          <p className="admin-error" role="alert">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="admin-success" role="status">
            {success}
          </p>
        ) : null}
        {generatedPassword ? (
          <p className="admin-notice" role="status">
            Temporary password: <strong>{generatedPassword}</strong>
          </p>
        ) : null}
        <div className="admin-filters">
          <label className="admin-form__label">
            Role filter
            <select
              className="admin-select"
              value={filters.role}
              onChange={(event) => setFilters((prev) => ({ ...prev, role: event.target.value as typeof prev.role }))}
            >
              {roleFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-form__label">
            Status filter
            <select
              className="admin-select"
              value={filters.status}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, status: event.target.value as typeof prev.status }))
              }
            >
              <option value="all">All statuses</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="admin-table-wrapper">
          <table className="admin-table" aria-label="Customer accounts">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Last login</th>
                <th scope="col">Created</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={7} className="admin-empty">
                    No users match the selected filters.
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr key={record.id}>
                    <td>{record.fullName}</td>
                    <td>{record.email}</td>
                    <td>{roleLabelMap[record.role]}</td>
                    <td>
                      <span className={`admin-pill ${record.status === 'active' ? 'admin-pill--success' : ''}`}>
                        {record.status}
                      </span>
                    </td>
                    <td>{record.lastLoginAt ? formatDateTime(record.lastLoginAt) : 'Never'}</td>
                    <td>{formatDateTime(record.createdAt)}</td>
                    <td>
                      <div className="admin-button-group">
                        <button
                          type="button"
                          className="admin-button"
                          onClick={() => setSelectedId(record.id)}
                          disabled={loading}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="admin-button admin-button--secondary"
                          onClick={() => void handleResetPassword(record.id)}
                          disabled={loading}
                        >
                          Reset password
                        </button>
                        <button
                          type="button"
                          className="admin-button admin-button--danger"
                          onClick={() => void handleDelete(record.id)}
                          disabled={loading}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <form className="admin-form" onSubmit={handleSubmit} noValidate>
          <h2>{selectedId ? 'Update user account' : 'Create user account'}</h2>
          <div className="admin-form__grid">
            <label className="admin-form__label">
              Email
              <input
                className="admin-input"
                type="email"
                value={formState.email}
                onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))}
                required
              />
            </label>
            <label className="admin-form__label">
              Full name
              <input
                className="admin-input"
                value={formState.fullName}
                onChange={(event) => setFormState((prev) => ({ ...prev, fullName: event.target.value }))}
                required
              />
            </label>
            <label className="admin-form__label">
              Role
              <select
                className="admin-select"
                value={formState.role}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, role: event.target.value as SessionUser['role'] }))
                }
                required
              >
                {roleFormOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-form__label">
              Status
              <select
                className="admin-select"
                value={formState.status}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, status: event.target.value as typeof prev.status }))
                }
                required
                disabled={!selectedId}
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-form__label">
              {selectedId ? 'New password (optional)' : 'Temporary password'}
              <div className="password-field">
                <input
                  className="admin-input password-field__input"
                  type={showPassword ? 'text' : 'password'}
                  value={formState.password}
                  onChange={(event) => setFormState((prev) => ({ ...prev, password: event.target.value }))}
                  minLength={selectedId ? 0 : 12}
                  placeholder={selectedId ? 'Leave blank to keep current password' : 'Minimum 12 characters'}
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
            </label>
          </div>
          <div className="admin-form__actions">
            <button type="submit" className="admin-button" disabled={loading}>
              {selectedId ? 'Save changes' : 'Create user'}
            </button>
            {selectedId ? (
              <button
                type="button"
                className="admin-button admin-button--secondary"
                onClick={resetForm}
                disabled={loading}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </section>
    </AdminLayout>
  )
}

export const getServerSideProps: GetServerSideProps<AdminUsersProps> = async ({ req }) => {
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

export default AdminUsers
