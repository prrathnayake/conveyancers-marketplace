import Link from 'next/link'
import { useRouter } from 'next/router'
import type { FC, ReactNode } from 'react'
import { useEffect, useMemo, useState, useId } from 'react'
import ThemeToggle from './ThemeToggle'
import UserMenu from './UserMenu'

type PrimaryNavItem = {
  href: string
  label: string
  description: string
}

const mainNav: PrimaryNavItem[] = [
  {
    href: '/',
    label: 'Platform overview',
    description: 'Digitise every settlement milestone with audit-ready controls',
  },
  {
    href: '/search',
    label: 'Marketplace',
    description: 'Match with verified conveyancers and property law specialists',
  },
  {
    href: '/conveyancer',
    label: 'For conveyancers',
    description: 'Grow your practice with ready-to-brief developer mandates',
  },
  {
    href: '/chat',
    label: 'Client workspace',
    description: 'Collaborate securely with lenders, buyers, and allied professionals',
  },
]

type LayoutProps = {
  children: ReactNode
}

const Layout: FC<LayoutProps> = ({ children }) => {
  const router = useRouter()
  const activeMain = useMemo(() => {
    const prefixed = mainNav.find((item) => item.href !== '/' && router.pathname.startsWith(item.href))
    if (prefixed) {
      return prefixed
    }
    return mainNav.find((item) => router.pathname === item.href) ?? mainNav[0]
  }, [router.pathname])

  const [banner, setBanner] = useState<string>('')
  const [isPageLoading, setIsPageLoading] = useState(false)
  const [isNavOpen, setIsNavOpen] = useState(false)
  const navPanelId = useId()

  useEffect(() => {
    const handleStart = () => {
      setIsPageLoading(true)
    }
    const handleStop = () => {
      setIsPageLoading(false)
      setIsNavOpen(false)
    }

    router.events.on('routeChangeStart', handleStart)
    router.events.on('routeChangeComplete', handleStop)
    router.events.on('routeChangeError', handleStop)

    return () => {
      router.events.off('routeChangeStart', handleStart)
      router.events.off('routeChangeComplete', handleStop)
      router.events.off('routeChangeError', handleStop)
    }
  }, [router])

  useEffect(() => {
    setIsNavOpen(false)
  }, [router.pathname])

  useEffect(() => {
    const controller = new AbortController()
    const loadBanner = async () => {
      try {
        const response = await fetch('/api/platform/settings', { signal: controller.signal })
        if (!response.ok) {
          return
        }
        const payload = (await response.json()) as { settings?: Record<string, string> }
        setBanner(payload.settings?.statusBanner ?? '')
      } catch (error) {
        if (!(error instanceof DOMException)) {
          console.error('Failed to load settings', error)
        }
      }
    }
    void loadBanner()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsNavOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleNavLinkClick = () => {
    setIsNavOpen(false)
  }

  return (
    <div className="app-shell">
      <header className="site-header" role="banner">
        <div className="site-header__topline">
          <span className="site-header__topline-text">
            Trusted by development, lending, and conveyancing teams for frictionless settlements.
          </span>
          <Link href="/search?tab=jobs" className="site-header__topline-link">
            View live matters
          </Link>
        </div>
        <div className="site-header__bar">
          <Link href="/" className="site-logo" aria-label="Conveyancers Marketplace home">
            <span className="site-logo__mark" aria-hidden="true">
              CM
            </span>
            <span className="site-logo__text">
              <span className="site-logo__title">Conveyancers Marketplace</span>
              <span className="site-logo__subtitle">Settlement workflows without friction</span>
            </span>
          </Link>
          <nav aria-label="Primary" className="site-nav" data-state={isNavOpen ? 'open' : 'closed'}>
            <button
              type="button"
              className="site-nav__toggle"
              aria-expanded={isNavOpen}
              aria-controls={navPanelId}
              onClick={() => setIsNavOpen((prev) => !prev)}
            >
              <span className="site-nav__toggle-icon" aria-hidden="true" />
              <span className="site-nav__toggle-label">Menu</span>
            </button>
            <div className={`site-nav__panel ${isNavOpen ? 'site-nav__panel--open' : ''}`} id={navPanelId}>
              <ul className="site-nav__list">
                {mainNav.map((item) => {
                  const isActive = activeMain?.href === item.href
                  return (
                    <li key={item.href} className="site-nav__item">
                      <Link
                        href={item.href}
                        className={`site-nav__link ${isActive ? 'site-nav__link--active' : ''}`}
                        onClick={handleNavLinkClick}
                      >
                        <span className="site-nav__label">{item.label}</span>
                        <span className="site-nav__description">{item.description}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          </nav>
          <div className="site-header__actions">
            <Link href="/signup" className="site-nav__cta">
              Book a demo
            </Link>
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>
      {banner ? (
        <div role="alert" className="status-banner">
          <strong>Notice:</strong> {banner}
        </div>
      ) : null}
      {isPageLoading ? (
        <div className="page-loading-overlay" role="status" aria-live="polite">
          <div className="page-loading-overlay__content">
            <div className="page-loading-spinner" aria-hidden="true" />
            <span className="page-loading-text">Loading</span>
          </div>
        </div>
      ) : null}
      <main className="site-content" aria-busy={isPageLoading} data-loading={isPageLoading}>
        {children}
      </main>
    </div>
  )
}

export default Layout
