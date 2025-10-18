import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
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
  const menuRef = useRef<HTMLDivElement | null>(null)

  if (!user) {
    return null
  }

  useEffect(() => {
    if (!open) {
      return
    }

    const handlePointer = (event: MouseEvent | TouchEvent) => {
      if (!menuRef.current || !(event.target instanceof Node)) {
        return
      }
      if (!menuRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const handleFocus = (event: FocusEvent) => {
      if (!menuRef.current || !(event.target instanceof Node)) {
        return
      }
      if (!menuRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('touchstart', handlePointer)
    document.addEventListener('focusin', handleFocus)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('touchstart', handlePointer)
      document.removeEventListener('focusin', handleFocus)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className="user-menu" data-state={open ? 'open' : 'closed'} ref={menuRef}>
      <button
        type="button"
        className="user-avatar-button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${user.fullName} account menu`}
      >
        <span className="user-avatar" aria-hidden="true">
          {user.profileImageUrl ? <img src={user.profileImageUrl} alt="" /> : user.fullName.charAt(0)}
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
