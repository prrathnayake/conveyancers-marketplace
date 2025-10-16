import Link from 'next/link'
import { useRouter } from 'next/router'
import type { FC, ReactNode } from 'react'

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/conveyancers', label: 'Conveyancers' },
  { href: '/reviews', label: 'Reviews' },
  { href: '/audit-log', label: 'Audit log' },
  { href: '/system-logs', label: 'System logs' },
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
            const active = router.pathname === item.href
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
