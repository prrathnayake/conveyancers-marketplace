import Link from 'next/link'
import { useRouter } from 'next/router'
import type { FC, ReactNode } from 'react'
import { useEffect, useId, useRef, useState } from 'react'

import type { SessionUser } from '../../frontend/lib/session'

const navItems = [
  { href: '/', label: 'Overview' },
  { href: '/dashboard', label: 'Operations' },
  { href: '/conveyancers', label: 'Conveyancers' },
  { href: '/users', label: 'Customers' },
  { href: '/reviews', label: 'Reviews' },
  { href: '/enquiries', label: 'Enquiries' },
  { href: '/catalogue', label: 'Service catalogue' },
  { href: '/cms', label: 'Content & SEO' },
  { href: '/safety', label: 'Safety & ML' },
  { href: '/audit-log', label: 'Audit log' },
  { href: '/system-logs', label: 'System logs' },
  { href: '/settings', label: 'Platform settings' },
]

type AdminLayoutProps = {
  children: ReactNode
  user?: SessionUser | null
}

const AdminLayout: FC<AdminLayoutProps> = ({ children, user }) => {
  const router = useRouter()
  const menuId = useId()
  const [menuOpen, setMenuOpen] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const displayName = (user?.fullName ?? 'Administrator').trim() || 'Administrator'
  const displayEmail = user?.email ?? ''
  const nameSegments = displayName
    .split(' ')
    .filter((segment) => segment.trim().length > 0)
    .slice(0, 2)
  const initials = nameSegments
    .map((segment) => segment[0]?.toUpperCase() ?? '')
    .join('') || 'AD'

  useEffect(() => {
    if (!menuOpen) {
      return
    }
    const handleOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current) {
        return
      }
      if (event.target instanceof Node && !menuRef.current.contains(event.target)) {
        setMenuOpen(false)
      }
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [menuOpen])

  useEffect(() => {
    const handleRouteChange = () => {
      setMenuOpen(false)
      setLogoutError(null)
      setLoggingOut(false)
    }
    router.events.on('routeChangeStart', handleRouteChange)
    return () => {
      router.events.off('routeChangeStart', handleRouteChange)
    }
  }, [router])

  const handleToggleMenu = () => {
    setMenuOpen((previous) => {
      const next = !previous
      if (next) {
        void router.prefetch('/profile').catch(() => {
          // Ignore prefetch failures – the route is still accessible via navigation.
        })
      }
      return next
    })
    setLogoutError(null)
  }

  const handleLogout = async () => {
    if (loggingOut) {
      return
    }
    setLoggingOut(true)
    setLogoutError(null)
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!response.ok) {
        throw new Error('logout_failed')
      }
      setMenuOpen(false)
      const navigated = await router.push('/login')
      if (!navigated) {
        setLoggingOut(false)
      }
    } catch (error) {
      setLogoutError('Unable to end session. Please try again.')
      setLoggingOut(false)
    }
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-branding">
          <span className="admin-branding__mark">CM</span>
          <span className="admin-branding__title">Marketplace Control</span>
        </div>
        <nav aria-label="Admin navigation" className="admin-nav">
          {navItems.map((item) => {
            const active = item.href === '/' ? router.pathname === '/' : router.pathname.startsWith(item.href)
            return (
              <Link key={item.href} href={item.href} className={`admin-nav__item ${active ? 'admin-nav__item--active' : ''}`}>
                {item.label}
              </Link>
            )
          })}
        </nav>
        <a className="admin-nav__item admin-nav__item--muted" href={process.env.NEXT_PUBLIC_MAIN_APP_URL ?? 'http://localhost:5173'}>
          ← Back to marketplace
        </a>
      </aside>
      <main className="admin-content">
        <header className="admin-topbar">
          <div className="admin-topbar__spacer" aria-hidden="true" />
          <div className="admin-topbar__actions">
            <div ref={menuRef} className="admin-user-menu">
              <button
                type="button"
                className="admin-user-menu__button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls={menuId}
                onClick={handleToggleMenu}
              >
                <span className="admin-user-menu__avatar" aria-hidden="true">
                  {initials}
                </span>
                <span className="admin-user-menu__identity">
                  <span className="admin-user-menu__name">{displayName}</span>
                  {displayEmail ? <span className="admin-user-menu__email">{displayEmail}</span> : null}
                </span>
                <span className="admin-user-menu__chevron" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 20 20" focusable="false">
                    <path
                      d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.293l3.71-4.06a.75.75 0 1 1 1.1 1.02l-4.22 4.62a.75.75 0 0 1-1.1 0l-4.22-4.62a.75.75 0 0 1 .02-1.06z"
                      fill="currentColor"
                    />
                  </svg>
                </span>
              </button>
              {menuOpen ? (
                <div className="admin-user-menu__panel" role="menu" id={menuId}>
                  <Link
                    href="/profile"
                    className="admin-user-menu__item"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    Manage profile
                  </Link>
                  <button
                    type="button"
                    className="admin-user-menu__item admin-user-menu__item--danger"
                    role="menuitem"
                    onClick={handleLogout}
                    disabled={loggingOut}
                  >
                    {loggingOut ? 'Signing out…' : 'Sign out'}
                  </button>
                  {logoutError ? (
                    <p className="admin-user-menu__status" role="alert">
                      {logoutError}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <div className="admin-content__main">{children}</div>
      </main>
    </div>
  )
}

export default AdminLayout
