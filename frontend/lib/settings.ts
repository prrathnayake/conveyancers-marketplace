import db from './db'

const DEFAULT_SETTINGS: Record<string, string> = {
  supportEmail: 'support@conveyancers-marketplace.test',
  statusBanner: '',
  serviceFeeRate: '0.05',
  escrowAccountName: 'ConveySafe Trust Account',
}

export const getSetting = (key: string, fallback?: string): string => {
  const row = db.prepare('SELECT value FROM platform_settings WHERE key = ?').get(key) as { value: string } | undefined
  if (row?.value) {
    return row.value
  }
  if (typeof fallback === 'string') {
    return fallback
  }
  return DEFAULT_SETTINGS[key] ?? ''
}

export const getNumericSetting = (key: string, fallback?: number): number => {
  const value = getSetting(key, fallback !== undefined ? String(fallback) : undefined)
  const parsed = Number(value)
  if (Number.isFinite(parsed)) {
    return parsed
  }
  return fallback ?? 0
}

export const getServiceFeeRate = (): number => {
  const raw = getSetting('serviceFeeRate')
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return Number(DEFAULT_SETTINGS.serviceFeeRate)
  }
  return parsed
}

export const getEscrowAccountName = (): string => {
  return getSetting('escrowAccountName')
}

export const listSettings = (keys?: string[]): Record<string, string> => {
  const rows = db.prepare('SELECT key, value FROM platform_settings').all() as Array<{ key: string; value: string }>
  const payload: Record<string, string> = { ...DEFAULT_SETTINGS }
  for (const row of rows) {
    payload[row.key] = row.value
  }
  if (!keys) {
    return payload
  }
  return keys.reduce<Record<string, string>>((acc, key) => {
    acc[key] = payload[key] ?? ''
    return acc
  }, {})
}
