import fs from 'node:fs/promises'
import path from 'node:path'
import type { NextApiRequest, NextApiResponse } from 'next'

import { requireRole } from '../../../frontend/lib/session'
import { logServerError, serializeError } from '../../../frontend/lib/serverLogger'

const LOG_EXTENSION = '.log'
const MAX_ENTRIES = 200

export type SystemLogEntry = {
  timestamp: string
  category: string
  message: string
  context?: string
}

type SystemLogsListResponse = { services: string[] }
type SystemLogsEntriesResponse = { service: string; entries: SystemLogEntry[] }
type ApiErrorResponse = { error: string }

const resolveLogDirectory = (): string => {
  const configured = process.env.LOG_DIRECTORY?.trim()
  if (configured && configured.length > 0) {
    return path.resolve(configured)
  }
  return path.resolve(process.cwd(), '..', 'logs')
}

const sanitizeServiceName = (value: string): string | null => {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, '')
  if (cleaned.length === 0) {
    return null
  }
  return cleaned
}

const listServices = async (directory: string): Promise<string[]> => {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(LOG_EXTENSION))
      .map((entry) => entry.name.slice(0, -LOG_EXTENSION.length))
      .sort()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    throw error
  }
}

const composePrefixPattern = /^[A-Za-z0-9_.-]+\s+\|\s+/

const stripComposePrefix = (line: string): string => line.replace(composePrefixPattern, '')

const monthMap: Record<string, string> = {
  Jan: '01',
  Feb: '02',
  Mar: '03',
  Apr: '04',
  May: '05',
  Jun: '06',
  Jul: '07',
  Aug: '08',
  Sep: '09',
  Oct: '10',
  Nov: '11',
  Dec: '12',
}

const toIsoFromNginxTimestamp = (value: string): string | null => {
  const match =
    /^(?<day>\d{2})\/(?<month>[A-Za-z]{3})\/(?<year>\d{4}):(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2}) (?<tz>[+-]\d{4})$/.exec(
      value,
    )
  if (!match?.groups) {
    return null
  }

  const { day, month, year, hour, minute, second, tz } = match.groups
  const monthNumber = monthMap[month]
  if (!monthNumber) {
    return null
  }

  const timezone = `${tz.slice(0, 3)}:${tz.slice(3)}`
  return `${year}-${monthNumber}-${day}T${hour}:${minute}:${second}${timezone}`
}

const parseNginxAccessLog = (line: string): SystemLogEntry | null => {
  const cleaned = stripComposePrefix(line)
  const match =
    /^(?<remoteAddr>\S+)\s+\S+\s+\S+\s+\[(?<time>[^\]]+)]\s+"(?<request>.*?)"\s+(?<status>\d{3})\s+(?<bytes>\S+)\s+"(?<referrer>.*?)"\s+"(?<userAgent>.*?)"/.exec(
      cleaned,
    )
  if (!match?.groups) {
    return null
  }

  const { remoteAddr, time, request, status, bytes, referrer, userAgent } = match.groups

  const isoTimestamp = toIsoFromNginxTimestamp(time) ?? new Date().toISOString()

  const baseEntry: SystemLogEntry = {
    timestamp: isoTimestamp,
    category: 'nginx.access',
    message: `${remoteAddr} → ${status} (${request || '-'})`,
    context: `bytes=${bytes} referrer=${referrer || '-'} ua=${userAgent || '-'}`,
  }

  if (request.startsWith('\\x16\\x03')) {
    return {
      ...baseEntry,
      category: 'nginx.tls_handshake',
      message: `TLS handshake payload received on HTTP listener from ${remoteAddr} (status ${status})`,
    }
  }

  return baseEntry
}

const parseJsonLogLine = (line: string): SystemLogEntry | null => {
  try {
    const parsed = JSON.parse(line) as Partial<SystemLogEntry>
    const timestamp = typeof parsed.timestamp === 'string' && parsed.timestamp.length > 0 ? parsed.timestamp : new Date().toISOString()
    const category = typeof parsed.category === 'string' && parsed.category.length > 0 ? parsed.category : 'unknown'
    const message = typeof parsed.message === 'string' && parsed.message.length > 0 ? parsed.message : line
    const entry: SystemLogEntry = { timestamp, category, message }
    if (typeof parsed.context === 'string' && parsed.context.length > 0) {
      entry.context = parsed.context
    }
    return entry
  } catch {
    return null
  }
}

const parseLogLine = (line: string): SystemLogEntry => {
  const jsonEntry = parseJsonLogLine(line)
  if (jsonEntry) {
    return jsonEntry
  }

  const nginxEntry = parseNginxAccessLog(line)
  if (nginxEntry) {
    return nginxEntry
  }

  return {
    timestamp: new Date().toISOString(),
    category: 'unparsed',
    message: line,
  }
}

const readServiceLog = async (directory: string, service: string): Promise<SystemLogEntry[]> => {
  const baseDirectory = path.resolve(directory)
  const resolvedPath = path.resolve(baseDirectory, `${service}${LOG_EXTENSION}`)
  const relativePath = path.relative(baseDirectory, resolvedPath)
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('invalid log path')
  }
  const content = await fs.readFile(resolvedPath, 'utf8')
  const lines = content.split('\n').map((line) => line.trim()).filter((line) => line.length > 0)
  const selected = lines.slice(-MAX_ENTRIES)
  return selected.map(parseLogLine)
}

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse<SystemLogsListResponse | SystemLogsEntriesResponse | ApiErrorResponse>
): Promise<void> => {
  const user = requireRole(req, res, ['admin'])
  if (!user) {
    return
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const directory = resolveLogDirectory()
  const { service } = req.query

  if (typeof service === 'string') {
    const sanitized = sanitizeServiceName(service)
    if (!sanitized) {
      res.status(400).json({ error: 'invalid_service' })
      return
    }
    try {
      const entries = await readServiceLog(directory, sanitized)
      res.status(200).json({ service: sanitized, entries })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        res.status(404).json({ error: 'log_not_found' })
        return
      }
      logServerError('Failed to read system log', {
        error: serializeError(error),
        endpoint: '/api/system-logs',
        service: sanitized,
      })
      res.status(500).json({ error: 'log_read_failed' })
    }
    return
  }

  try {
    const services = await listServices(directory)
    res.status(200).json({ services })
  } catch (error) {
    logServerError('Failed to list system log services', {
      error: serializeError(error),
      endpoint: '/api/system-logs',
    })
    res.status(500).json({ error: 'log_directory_unavailable' })
  }
}

export default handler
