import db from '../../frontend/lib/db'

const isDatabaseUnavailable = (error: unknown): boolean => {
  return error instanceof Error && error.message === 'database_unavailable'
}

export type MonitoringPanel = {
  id: string
  title: string
  value: string
  trend: string
  series: number[]
  footnote: string
}

export type SummaryPayload = {
  conveyancers: number
  buyers: number
  sellers: number
  reviews: number
  lastAuditEvent?: {
    action: string
    entity: string
    actorEmail: string | null
    createdAt: string
  }
  monitoringPanels: MonitoringPanel[]
}

const DAY_WINDOW = 7

const buildDayRange = (days: number): string[] => {
  const result: string[] = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i -= 1) {
    const current = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
    current.setUTCDate(current.getUTCDate() - i)
    result.push(current.toISOString().slice(0, 10))
  }
  return result
}

const clampPercentage = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0
  }
  const bounded = Math.max(0, Math.min(100, value))
  return Number(bounded.toFixed(1))
}

const formatDelta = (
  current: number,
  previous: number | null,
  { unitSuffix, precision = 1, zeroLabel }: { unitSuffix: string; precision?: number; zeroLabel?: string },
): string => {
  if (previous === null || !Number.isFinite(previous)) {
    return 'Baseline measurement'
  }
  const delta = current - previous
  if (!Number.isFinite(delta)) {
    return 'Baseline measurement'
  }
  const threshold = precision >= 1 ? 0.05 : 0.5
  if (Math.abs(delta) < threshold) {
    return zeroLabel ?? `No change ${unitSuffix}`
  }
  const formatted = Math.abs(delta).toFixed(precision)
  const sign = delta > 0 ? '+' : '-'
  return `${sign}${formatted} ${unitSuffix}`
}

const formatMinutesValue = (minutes: number): string => {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return 'No data'
  }
  if (minutes >= 60) {
    const hours = minutes / 60
    const formatted = hours >= 10 ? Math.round(hours).toString() : hours.toFixed(1)
    return `${formatted} h`
  }
  const formatted = minutes >= 10 ? Math.round(minutes).toString() : minutes.toFixed(1)
  return `${formatted} min`
}

const median = (values: number[]): number => {
  if (values.length === 0) {
    return 0
  }
  const sorted = values.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

const calculateEscrowPanel = (): MonitoringPanel => {
  const dayKeys = buildDayRange(DAY_WINDOW)
  const rows = db
    .prepare(
      `SELECT DATE(COALESCE(released_at, accepted_at, created_at)) AS day,
              SUM(CASE WHEN released_at IS NOT NULL THEN 1 ELSE 0 END) AS released,
              SUM(CASE WHEN accepted_at IS NOT NULL THEN 1 ELSE 0 END) AS accepted
         FROM chat_invoices
        WHERE DATE(COALESCE(accepted_at, created_at)) >= DATE('now', '-6 day')
     GROUP BY day
     ORDER BY day`,
    )
    .all() as Array<{ day: string; released: number; accepted: number }>

  const stats = new Map<string, { released: number; accepted: number }>()
  for (const row of rows) {
    stats.set(row.day, {
      released: Number(row.released ?? 0),
      accepted: Number(row.accepted ?? 0),
    })
  }

  const series = dayKeys.map((day) => {
    const stat = stats.get(day)
    if (!stat) {
      return 100
    }
    if (!stat.accepted || stat.accepted === 0) {
      return 100
    }
    return clampPercentage((stat.released / stat.accepted) * 100)
  })

  const current = series[series.length - 1] ?? 100
  const previous = series.length > 1 ? series[series.length - 2] : null

  return {
    id: 'escrow-compliance',
    title: 'Escrow release compliance',
    value: `${current.toFixed(1)}%`,
    trend: formatDelta(current, previous, {
      unitSuffix: 'pp vs prior day',
      zeroLabel: 'No change vs prior day',
    }),
    series,
    footnote: 'Released escrow invoices divided by accepted invoices over the last 7 days.',
  }
}

const calculateResponsePanel = (): MonitoringPanel => {
  const dayKeys = buildDayRange(DAY_WINDOW)
  const rows = db
    .prepare(
      `SELECT id, conversation_id, sender_id, created_at
         FROM messages
        WHERE created_at >= DATETIME('now', '-7 day')
     ORDER BY conversation_id ASC, created_at ASC, id ASC`,
    )
    .all() as Array<{ id: number; conversation_id: number; sender_id: number; created_at: string }>

  const grouped = new Map<string, number[]>()
  const lastMessage = new Map<number, { senderId: number; createdAtMs: number }>()

  for (const row of rows) {
    const timestamp = Date.parse(row.created_at.endsWith('Z') ? row.created_at : `${row.created_at}Z`)
    if (Number.isNaN(timestamp)) {
      continue
    }
    const previous = lastMessage.get(row.conversation_id)
    if (previous && previous.senderId !== row.sender_id) {
      const diffMinutes = (timestamp - previous.createdAtMs) / 60000
      if (diffMinutes >= 0 && Number.isFinite(diffMinutes) && diffMinutes <= 24 * 60) {
        const dayKey = new Date(timestamp).toISOString().slice(0, 10)
        const bucket = grouped.get(dayKey) ?? []
        bucket.push(diffMinutes)
        grouped.set(dayKey, bucket)
      }
    }
    lastMessage.set(row.conversation_id, { senderId: row.sender_id, createdAtMs: timestamp })
  }

  const series = dayKeys.map((day) => {
    const samples = grouped.get(day)
    if (!samples || samples.length === 0) {
      return 0
    }
    return Number(median(samples).toFixed(1))
  })

  const current = series[series.length - 1] ?? 0
  const previous = series.length > 1 ? series[series.length - 2] : null

  return {
    id: 'chat-response',
    title: 'Secure chat median response',
    value: formatMinutesValue(current),
    trend: formatDelta(current, previous, {
      unitSuffix: 'min vs prior day',
      precision: 1,
      zeroLabel: 'No change vs prior day',
    }),
    series,
    footnote: 'Median cross-party reply time in secure chat conversations during the last 7 days.',
  }
}

const calculatePolicyPanel = (): MonitoringPanel => {
  const dayKeys = buildDayRange(DAY_WINDOW)
  const rows = db
    .prepare(
      `SELECT DATE(created_at) AS day, COUNT(1) AS total
         FROM message_policy_flags
        WHERE DATE(created_at) >= DATE('now', '-6 day')
     GROUP BY day
     ORDER BY day`,
    )
    .all() as Array<{ day: string; total: number }>

  const totals = new Map<string, number>()
  for (const row of rows) {
    totals.set(row.day, Number(row.total ?? 0))
  }

  const series = dayKeys.map((day) => totals.get(day) ?? 0)
  const current = series[series.length - 1] ?? 0
  const previous = series.length > 1 ? series[series.length - 2] : null
  const value = current === 0 ? '0 flags' : `${current} flag${current === 1 ? '' : 's'}`

  return {
    id: 'policy-flags',
    title: 'Policy enforcement alerts',
    value,
    trend: formatDelta(current, previous, {
      unitSuffix: 'vs prior day',
      precision: 0,
      zeroLabel: 'No change vs prior day',
    }),
    series,
    footnote: 'Policy violations detected across secure chat conversations in the last 7 days.',
  }
}

const buildMonitoringPanels = (): MonitoringPanel[] => [
  calculateEscrowPanel(),
  calculateResponsePanel(),
  calculatePolicyPanel(),
]

const FALLBACK_SUMMARY: SummaryPayload = {
  conveyancers: 0,
  buyers: 0,
  sellers: 0,
  reviews: 0,
  monitoringPanels: [],
}

export const loadAdminSummary = (): SummaryPayload => {
  try {
    const conveyancers = db.prepare("SELECT COUNT(1) AS total FROM users WHERE role = 'conveyancer'").get() as { total: number }
    const buyers = db.prepare("SELECT COUNT(1) AS total FROM users WHERE role = 'buyer'").get() as { total: number }
    const sellers = db.prepare("SELECT COUNT(1) AS total FROM users WHERE role = 'seller'").get() as { total: number }
    const reviews = db.prepare('SELECT COUNT(1) AS total FROM conveyancer_reviews').get() as { total: number }

    const lastAudit = db
      .prepare(
        `SELECT a.action, a.entity, a.created_at, u.email as actor_email
           FROM admin_audit_log a
      LEFT JOIN users u ON u.id = a.actor_id
       ORDER BY a.created_at DESC
          LIMIT 1`,
      )
      .get() as { action: string; entity: string; created_at: string; actor_email: string | null } | undefined

    const monitoringPanels = buildMonitoringPanels()

    return {
      conveyancers: conveyancers.total,
      buyers: buyers.total,
      sellers: sellers.total,
      reviews: reviews.total,
      lastAuditEvent: lastAudit
        ? {
            action: lastAudit.action,
            entity: lastAudit.entity,
            actorEmail: lastAudit.actor_email,
            createdAt: lastAudit.created_at,
          }
        : undefined,
      monitoringPanels,
    }
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return FALLBACK_SUMMARY
    }
    throw error
  }
}
