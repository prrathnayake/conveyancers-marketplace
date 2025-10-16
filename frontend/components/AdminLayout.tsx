import Link from 'next/link'
import { useRouter } from 'next/router'
import type { FC, ReactNode } from 'react'

const navItems = [
  { href: '/admin-portal', label: 'Dashboard' },
  { href: '/admin-portal/conveyancers', label: 'Conveyancers' },
  { href: '/admin-portal/reviews', label: 'Reviews' },
  { href: '/admin-portal/audit-log', label: 'Audit log' },
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
          <span className="brand-mark">CM</span>
          <span className="brand-title">Marketplace Control</span>
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
      </aside>
      <main className="admin-content">{children}</main>
      <style jsx>{`
        .admin-shell {
          display: grid;
          grid-template-columns: 280px 1fr;
          min-height: 100vh;
          background: radial-gradient(circle at top left, rgba(59, 130, 246, 0.08), transparent 55%),
            linear-gradient(135deg, rgba(15, 23, 42, 0.92), rgba(15, 23, 42, 0.88));
          color: #e2e8f0;
        }

        .admin-sidebar {
          padding: 2.5rem 2rem;
          border-right: 1px solid rgba(148, 163, 184, 0.14);
          display: flex;
          flex-direction: column;
          gap: 2.5rem;
          background: rgba(15, 23, 42, 0.7);
          backdrop-filter: blur(12px);
        }

        .admin-branding {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          font-weight: 600;
          letter-spacing: 0.05em;
        }

        .brand-mark {
          width: 40px;
          height: 40px;
          display: grid;
          place-items: center;
          border-radius: 12px;
          background: linear-gradient(135deg, #2563eb, #38bdf8);
          color: #f8fafc;
          font-weight: 700;
        }

        .brand-title {
          font-size: 1rem;
          color: #cbd5f5;
          text-transform: uppercase;
        }

        .admin-nav {
          display: grid;
          gap: 0.65rem;
        }

        .admin-nav__item {
          padding: 0.75rem 1rem;
          border-radius: 12px;
          color: rgba(226, 232, 240, 0.85);
          transition: background 0.2s ease, color 0.2s ease;
        }

        .admin-nav__item:hover,
        .admin-nav__item:focus-visible {
          background: rgba(59, 130, 246, 0.18);
          color: #f8fafc;
        }

        .admin-nav__item--active {
          background: linear-gradient(135deg, rgba(37, 99, 235, 0.9), rgba(29, 78, 216, 0.9));
          color: #f8fafc;
          box-shadow: 0 12px 24px rgba(37, 99, 235, 0.3);
        }

        .admin-content {
          padding: 3rem;
          background: linear-gradient(160deg, rgba(15, 23, 42, 0.88), rgba(15, 23, 42, 0.94));
        }

        @media (max-width: 980px) {
          .admin-shell {
            grid-template-columns: 1fr;
          }
          .admin-sidebar {
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            padding: 1.5rem;
          }
          .admin-nav {
            display: flex;
            gap: 0.5rem;
          }
        }
      `}</style>
    </div>
  )
}

export default AdminLayout
