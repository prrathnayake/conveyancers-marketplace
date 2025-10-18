import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next'

export type ObservedRequest = NextApiRequest & { correlationId: string }

const resolveLogLocation = (): string => {
  const directory = path.join(process.cwd(), 'logs')
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true })
  }
  return path.join(directory, 'api-observability.log')
}

const logFile = resolveLogLocation()

const appendLog = (entry: Record<string, unknown>): void => {
  fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`, { encoding: 'utf-8' })
}

export type ObservabilityOptions = {
  feature: string
}

export const withObservability = <T = any>(
  handler: (req: ObservedRequest, res: NextApiResponse<T>) => void | Promise<void>,
  options: ObservabilityOptions
): NextApiHandler<T> => {
  return async (req, res) => {
    const correlationId = (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID()
    const startedAt = process.hrtime.bigint()
    const observedRequest = Object.assign(req, { correlationId }) as ObservedRequest
    let errorPayload: unknown = null
    try {
      res.setHeader('X-Correlation-Id', correlationId)
      await handler(observedRequest, res)
    } catch (error) {
      errorPayload = error instanceof Error ? { message: error.message, stack: error.stack } : error
      appendLog({
        correlationId,
        feature: options.feature,
        status: res.statusCode || 500,
        level: 'error',
        error: errorPayload,
        method: req.method,
        path: req.url,
        timestamp: new Date().toISOString(),
        durationMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
      })
      throw error
    } finally {
      if (!errorPayload) {
        appendLog({
          correlationId,
          feature: options.feature,
          status: res.statusCode || 200,
          level: 'info',
          method: req.method,
          path: req.url,
          timestamp: new Date().toISOString(),
          durationMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
        })
      }
    }
  }
}

export const logTrace = (correlationId: string, category: string, details: Record<string, unknown>): void => {
  appendLog({
    correlationId,
    category,
    level: 'trace',
    timestamp: new Date().toISOString(),
    ...details,
  })
}
