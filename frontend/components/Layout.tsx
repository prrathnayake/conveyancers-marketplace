import Link from 'next/link'
import { useRouter } from 'next/router'
import type { FC, ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import ThemeToggle from './ThemeToggle'
import UserMenu from './UserMenu'

type PrimaryNavItem = {
  href: string
  label: string
}

type SubNavItem =
  | {
      href: string
      label: string
    }
  | {
      anchor: string
      label: string
    }

const mainNav: PrimaryNavItem[] = [
  { href: '/', label: 'Overview' },
  { href: '/search', label: 'Find experts' },
]

const workflowNav: SubNavItem[] = [
  { anchor: '#workflow', label: 'Milestone flow' },
  { anchor: '#features', label: 'Security' },
  { anchor: '#faq', label: 'FAQs' },
]

const sellerNav: SubNavItem[] = [
  { href: '/search?seller=true', label: 'Seller dashboard' },
  { href: '/search?tab=jobs', label: 'Active jobs' },
  { href: '/search?tab=documents', label: 'Documents' },
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

  const isAnchorItem = (item: SubNavItem): item is Extract<SubNavItem, { anchor: string }> => {
    return Object.prototype.hasOwnProperty.call(item, 'anchor')
  }

  const subNav = useMemo(() => {
    if (router.pathname.startsWith('/search')) {
      return sellerNav
    }
    return workflowNav
  }, [router.pathname])

  const [banner, setBanner] = useState<string>('')
  const [isPageLoading, setIsPageLoading] = useState(false)

  useEffect(() => {
    const handleStart = () => {
      setIsPageLoading(true)
    }
    const handleStop = () => {
      setIsPageLoading(false)
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

  return (
    <div className="app-shell">
      <header className="site-header" role="banner">
        <div className="site-header__bar">
          <Link href="/" className="site-logo">
            Conveyancers Marketplace
          </Link>
          <nav aria-label="Primary" className="site-nav">
            {mainNav.map((item) => {
              const isActive = activeMain?.href === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`site-nav__item ${isActive ? 'site-nav__item--active' : ''}`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
          <div className="site-header__actions">
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
        <nav aria-label="Context" className="site-subnav">
          {subNav.map((item) => {
            if (isAnchorItem(item)) {
              return (
                <a key={item.anchor} href={item.anchor} className="site-subnav__item">
                  {item.label}
                </a>
              )
            }
            return (
              <Link key={item.href} href={item.href} className="site-subnav__item">
                {item.label}
              </Link>
            )
          })}
        </nav>
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
