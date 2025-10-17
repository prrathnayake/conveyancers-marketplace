import Link from 'next/link'
import { useRouter } from 'next/router'
import type { FC, ReactNode } from 'react'

const navItems = [
  { href: '/', label: 'Overview' },
  { href: '/dashboard', label: 'Operations' },
  { href: '/conveyancers', label: 'Conveyancers' },
  { href: '/reviews', label: 'Reviews' },
  { href: '/enquiries', label: 'Enquiries' },
  { href: '/catalogue', label: 'Service catalogue' },
  { href: '/safety', label: 'Safety & ML' },
  { href: '/audit-log', label: 'Audit log' },
  { href: '/system-logs', label: 'System logs' },
  { href: '/settings', label: 'Platform settings' },
]

type AdminLayoutProps = {
  children: ReactNode
}

const AdminLayout: FC<AdminLayoutProps> = ({ children }) => {
  const router = useRouter()

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
      <main className="admin-content">{children}</main>
    </div>
  )
}

export default AdminLayout
