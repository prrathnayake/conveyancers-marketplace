import Link from 'next/link'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const roleLabels: Record<string, string> = {
  buyer: 'Buyer',
  seller: 'Seller',
  conveyancer: 'Conveyancer',
  admin: 'Admin',
}

const adminPortalUrl = process.env.NEXT_PUBLIC_ADMIN_PORTAL_URL

const UserMenu = (): JSX.Element => {
  const { user, logout } = useAuth()
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
        {user.role === 'admin' && adminPortalUrl ? (
          <a
            href={adminPortalUrl}
            className="dropdown-item"
            role="menuitem"
            target="_blank"
            rel="noreferrer noopener"
          >
            Admin portal
          </a>
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
