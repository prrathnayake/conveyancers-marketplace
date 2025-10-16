import Link from 'next/link'
import { useRouter } from 'next/router'
import type { FC, ReactNode } from 'react'
import { useMemo } from 'react'

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
  { href: '/admin/seed', label: 'Operations' },
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

const adminNav: SubNavItem[] = [
  { href: '/admin/seed#access-control', label: 'Access control' },
  { href: '/admin/seed#data-ops', label: 'Data operations' },
  { href: '/admin/seed#audit-trails', label: 'Audit log' },
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
    if (router.pathname.startsWith('/admin')) {
      return adminNav
    }
    if (router.pathname.startsWith('/search')) {
      return sellerNav
    }
    return workflowNav
  }, [router.pathname])

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
          <div className="site-header__meta">
            <span className="site-header__badge">Secure logging enabled</span>
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
      <div className="site-content">{children}</div>
    </div>
  )
}

export default Layout
