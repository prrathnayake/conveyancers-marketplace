import fs from 'node:fs'
import path from 'node:path'
type ApiRequestLike = {
  method?: string | undefined
  url?: string | null | undefined
}

type ApiResponseLike = {
  status: (statusCode: number) => { json: (body: unknown) => void }
}

type ApiHandlerLike<
  TRequest extends ApiRequestLike = ApiRequestLike,
  TResponse extends ApiResponseLike = ApiResponseLike,
> = (req: TRequest, res: TResponse) => unknown | Promise<unknown>

type LogCategory = 'error' | 'info' | 'audit' | 'debug'

type LogContext = Record<string, unknown>

const detectServiceName = (): string => {
  const explicit = process.env.SERVICE_NAME?.trim()
  if (explicit) {
    return explicit
  }
  const normalizedCwd = process.cwd().replace(/\\/g, '/').toLowerCase()
  if (normalizedCwd.includes('/admin-portal')) {
    return 'admin-portal'
  }
  return 'frontend'
}

const serviceName = detectServiceName()

const resolveLogDirectory = (): string => {
  const configured = process.env.LOG_DIRECTORY?.trim()
  const target = configured && configured.length > 0 ? path.resolve(configured) : path.resolve(process.cwd(), '..', 'logs')
  try {
    fs.mkdirSync(target, { recursive: true })
    return target
  } catch (error) {
    const fallback = path.join('/tmp', serviceName, 'logs')
    try {
      fs.mkdirSync(fallback, { recursive: true })
    } catch (fallbackError) {
      // eslint-disable-next-line no-console
      console.error('Failed to create fallback log directory', fallbackError)
    }
    // eslint-disable-next-line no-console
    console.warn('Falling back to writable log directory', { target, fallback, error })
    return fallback
  }
}

const logDirectory = resolveLogDirectory()
const serviceLogPath = path.join(logDirectory, `${serviceName}.log`)
const errorLogPath = path.join(logDirectory, 'errors.log')

const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value)
  } catch (error) {
    return String(value)
  }
}

const serializeContext = (context?: LogContext): string | undefined => {
  if (!context || Object.keys(context).length === 0) {
    return undefined
  }
  return safeStringify(context)
}

const writeLogEntry = (category: LogCategory, message: string, context?: LogContext): void => {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    service: serviceName,
    category,
    message,
  }
  const serializedContext = serializeContext(context)
  if (serializedContext) {
    entry.context = serializedContext
  }
  const payload = JSON.stringify(entry)
  try {
    fs.appendFileSync(serviceLogPath, `${payload}\n`, 'utf8')
    if (category === 'error') {
      fs.appendFileSync(errorLogPath, `${payload}\n`, 'utf8')
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to write server log entry', error)
  }
}

export const serializeError = (error: unknown): LogContext => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }
  if (typeof error === 'object' && error) {
    return { ...error }
  }
  return { message: String(error) }
}

export const logServerError = (message: string, context?: LogContext): void => {
  writeLogEntry('error', message, context)
}

export const logServerEvent = (category: Exclude<LogCategory, 'error'>, message: string, context?: LogContext): void => {
  writeLogEntry(category, message, context)
}

export const withErrorLogging = <
  TRequest extends ApiRequestLike,
  TResponse extends ApiResponseLike,
>(
  handler: ApiHandlerLike<TRequest, TResponse>,
  message = 'Unhandled API route error'
): ApiHandlerLike<TRequest, TResponse> => {
  return async (req, res) => {
    try {
      await handler(req, res)
    } catch (error) {
      logServerError(message, {
        error: serializeError(error),
        method: req.method,
        url: req.url,
      })
      res.status(500).json({ error: 'internal_error' })
    }
  }
}

export type { LogContext }
