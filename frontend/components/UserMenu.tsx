import Link from 'next/link'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

const roleLabels: Record<string, string> = {
  buyer: 'Buyer',
  seller: 'Seller',
  conveyancer: 'Conveyancer',
  admin: 'Admin',
}

const UserMenu = (): JSX.Element => {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [open, setOpen] = useState(false)

  if (!user) {
    return (
      <div className="user-menu">
        <Link href="/login" className="cta-secondary">
          Log in
        </Link>
        <Link href="/signup" className="cta-primary">
          Create account
        </Link>
        <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
    )
  }

  return (
    <div className="user-menu" data-state={open ? 'open' : 'closed'}>
      <button
        type="button"
        className="user-pill"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="user-avatar">{user.fullName.charAt(0)}</span>
        <span className="user-details">
          <span className="user-name">{user.fullName}</span>
          <span className="user-role">{roleLabels[user.role] ?? user.role}</span>
        </span>
      </button>
      <div className="user-dropdown" role="menu">
        <button type="button" className="dropdown-item" onClick={toggleTheme} role="menuitem">
          Toggle {theme === 'dark' ? 'light' : 'dark'} mode
        </button>
        <Link href="/account" className="dropdown-item" role="menuitem">
          Account settings
        </Link>
        {user.role === 'conveyancer' ? (
          <Link href="/conveyancer/profile" className="dropdown-item" role="menuitem">
            Profile
          </Link>
        ) : null}
        <Link href="/chat" className="dropdown-item" role="menuitem">
          Secure chat
        </Link>
        {user.role === 'admin' ? (
          <Link href="/admin" className="dropdown-item" role="menuitem">
            Admin controls
          </Link>
        ) : null}
        <button
          type="button"
          className="dropdown-item dropdown-item--danger"
          onClick={() => {
            void logout()
            setOpen(false)
          }}
          role="menuitem"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

export default UserMenu
