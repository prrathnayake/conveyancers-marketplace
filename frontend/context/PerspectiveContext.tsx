import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { useAuth } from './AuthContext'

export type ClientPerspective = 'buyer' | 'seller'

type PerspectiveContextValue = {
  perspective: ClientPerspective
  setPerspective: (value: ClientPerspective) => void
  availablePerspectives: ClientPerspective[]
}

const STORAGE_KEY = 'conveyancers:pinnedPerspective'

const PerspectiveContext = createContext<PerspectiveContextValue | undefined>(undefined)

export const PerspectiveProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const { user, loading } = useAuth()
  const [perspective, setPerspectiveState] = useState<ClientPerspective>('buyer')

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'buyer' || stored === 'seller') {
      setPerspectiveState(stored)
    }
  }, [])

  useEffect(() => {
    if (loading) {
      return
    }
    if (typeof window === 'undefined') {
      return
    }
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'buyer' || stored === 'seller') {
      return
    }
    if (user?.role === 'seller') {
      setPerspectiveState('seller')
    } else if (user?.role === 'buyer') {
      setPerspectiveState('buyer')
    }
  }, [loading, user])

  const availablePerspectives = useMemo<ClientPerspective[]>(() => ['buyer', 'seller'], [])

  const setPerspective = (value: ClientPerspective) => {
    setPerspectiveState(value)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, value)
    }
  }

  return (
    <PerspectiveContext.Provider value={{ perspective, setPerspective, availablePerspectives }}>
      {children}
    </PerspectiveContext.Provider>
  )
}

export const usePerspective = (): PerspectiveContextValue => {
  const ctx = useContext(PerspectiveContext)
  if (!ctx) {
    throw new Error('usePerspective must be used within PerspectiveProvider')
  }
  return ctx
}
