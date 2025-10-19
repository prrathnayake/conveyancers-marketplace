import { useCallback, useEffect, useRef } from 'react'

export const useScrollReveal = () => {
  const elementsRef = useRef(new Set<HTMLElement>())
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal-visible')
            observer.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.2, rootMargin: '0px 0px -10%' },
    )
    observerRef.current = observer
    elementsRef.current.forEach((element) => observer.observe(element))

    return () => {
      observer.disconnect()
      observerRef.current = null
      elementsRef.current.clear()
    }
  }, [])

  const register = useCallback((element: HTMLElement | null) => {
    if (!element) {
      return
    }
    element.classList.add('reveal')
    elementsRef.current.add(element)
    if (observerRef.current) {
      observerRef.current.observe(element)
    }
  }, [])

  return { register }
}

export default useScrollReveal
