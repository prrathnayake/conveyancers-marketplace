import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { SessionUser } from '../lib/session'

type AuthContextValue = {
  user: SessionUser | null
  loading: boolean
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export const AuthProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/session')
      const payload = (await response.json()) as { authenticated: boolean; user?: SessionUser }
      if (payload.authenticated && payload.user) {
        setUser(payload.user)
      } else {
        setUser(null)
      }
    } catch (error) {
      console.error('Failed to refresh session', error)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    await refresh()
  }

  useEffect(() => {
    void refresh()
  }, [])

  return <AuthContext.Provider value={{ user, loading, refresh, logout }}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
