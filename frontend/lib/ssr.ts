import type { IncomingHttpHeaders } from 'http'

type HeaderLike = IncomingHttpHeaders | Record<string, string | string[] | undefined> | undefined

const BUILD_PHASE_TOKEN = 'phase-production-build'

export const isBuildPhase = (): boolean => {
  return (process.env.NEXT_PHASE ?? '').includes(BUILD_PHASE_TOKEN)
}

export const isStaticGenerationRequest = (headers?: HeaderLike): boolean => {
  if (isBuildPhase()) {
    return true
  }

  if (!headers) {
    return false
  }

  const value = headers['user-agent']
  if (value === undefined) {
    return true
  }

  const agent = Array.isArray(value) ? value.join(' ') : value ?? ''
  if (agent.trim().length === 0) {
    return true
  }

  const normalized = agent.toLowerCase()
  return (
    normalized.includes('next.js static generation') ||
    normalized.includes('next.js serverless') ||
    normalized.includes('next.js build worker')
  )
}
