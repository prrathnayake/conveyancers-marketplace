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

const UserMenu = (): JSX.Element | null => {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)

  if (!user) {
    return null
  }

  return (
    <div className="user-menu" data-state={open ? 'open' : 'closed'}>
      <button
        type="button"
        className="user-avatar-button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${user.fullName} account menu`}
      >
        <span className="user-avatar" aria-hidden="true">
          {user.fullName.charAt(0)}
        </span>
      </button>
      <div className="user-dropdown" role="menu">
        <div className="user-dropdown__header" role="presentation">
          <span className="user-dropdown__name">{user.fullName}</span>
          <span className="user-dropdown__role">{roleLabels[user.role] ?? user.role}</span>
        </div>
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
