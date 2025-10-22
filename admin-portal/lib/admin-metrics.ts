import db from '../../frontend/lib/db'

const isDatabaseUnavailable = (error: unknown): boolean => {
  return error instanceof Error && error.message === 'database_unavailable'
}

export type CheckoutReceipt = {
  id: string
  paymentId: string
  jobId: string
  method: string
  currency: string
  reference: string
  holdAmountCents: number
  serviceFeeCents: number
  serviceFeeRate: number
  totalCents: number
  processedAt: string
  invoiceId?: string
}

export type MetricBreakdown = {
  count: number
  totalCents: number
}

export type MetricsPayload = {
  generatedAt: string
  payments: {
    total: number
    held: MetricBreakdown
    released: MetricBreakdown
    refunded: MetricBreakdown
    outstandingCents: number
  }
  checkouts: {
    total: number
    totalCents: number
    serviceFeeCents: number
    averageOrderCents: number
    recent: CheckoutReceipt[]
  }
  invoices: {
    total: number
    draft: number
    issued: number
    paid: number
    voided: number
    overdue: number
    outstandingCents: number
    totalCents: number
  }
  accounts: {
    conveyancers: number
    buyers: number
    sellers: number
    reviews: number
  }
}

export type MetricsLoadResult = {
  metrics: MetricsPayload | null
  error?: { code: 'payments_unavailable' | 'metrics_timeout' | 'database_unavailable'; detail?: string }
}

const serializeCheckout = (payload: Record<string, unknown>): CheckoutReceipt => {
  return {
    id: String(payload.id ?? ''),
    paymentId: String(payload.payment_id ?? ''),
    jobId: String(payload.job_id ?? ''),
    method: String(payload.method ?? ''),
    currency: String(payload.currency ?? ''),
    reference: String(payload.reference ?? ''),
    holdAmountCents: Number(payload.hold_amount_cents ?? 0),
    serviceFeeCents: Number(payload.service_fee_cents ?? 0),
    serviceFeeRate: Number(payload.service_fee_rate ?? 0),
    totalCents: Number(payload.total_cents ?? 0),
    processedAt: String(payload.processed_at ?? ''),
    invoiceId: payload.invoice_id ? String(payload.invoice_id) : undefined,
  }
}

const toMetricBreakdown = (payload: Record<string, unknown> | null | undefined): MetricBreakdown => ({
  count: Number(payload?.count ?? 0),
  totalCents: Number(payload?.total_cents ?? 0),
})

const FALLBACK_METRICS: MetricsPayload = {
  generatedAt: new Date(0).toISOString(),
  payments: {
    total: 0,
    held: { count: 0, totalCents: 0 },
    released: { count: 0, totalCents: 0 },
    refunded: { count: 0, totalCents: 0 },
    outstandingCents: 0,
  },
  checkouts: {
    total: 0,
    totalCents: 0,
    serviceFeeCents: 0,
    averageOrderCents: 0,
    recent: [],
  },
  invoices: {
    total: 0,
    draft: 0,
    issued: 0,
    paid: 0,
    voided: 0,
    overdue: 0,
    outstandingCents: 0,
    totalCents: 0,
  },
  accounts: {
    conveyancers: 0,
    buyers: 0,
    sellers: 0,
    reviews: 0,
  },
}

const isBuildPhase = (): boolean => {
  const phase = process.env.NEXT_PHASE?.trim().toLowerCase()
  return phase === 'phase-production-build'
}

export const loadMetrics = async (options: { skipExternal?: boolean } = {}): Promise<MetricsLoadResult> => {
  let conveyancers = 0
  let buyers = 0
  let sellers = 0
  let reviews = 0
  try {
    conveyancers = Number(
      (db.prepare("SELECT COUNT(1) AS total FROM users WHERE role = 'conveyancer'").get() as { total: number } | undefined)?.total ?? 0,
    )
    buyers = Number(
      (db.prepare("SELECT COUNT(1) AS total FROM users WHERE role = 'buyer'").get() as { total: number } | undefined)?.total ?? 0,
    )
    sellers = Number(
      (db.prepare("SELECT COUNT(1) AS total FROM users WHERE role = 'seller'").get() as { total: number } | undefined)?.total ?? 0,
    )
    reviews = Number((db.prepare('SELECT COUNT(1) AS total FROM conveyancer_reviews').get() as { total: number } | undefined)?.total ?? 0)
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return { metrics: null, error: { code: 'database_unavailable' } }
    }
    throw error
  }

  const skipExternal = options.skipExternal ?? isBuildPhase()
  let raw: Record<string, any> | null = null
  let generatedAt = new Date().toISOString()

  if (!skipExternal) {
    const paymentsServiceUrl = process.env.PAYMENTS_SERVICE_URL ?? 'http://127.0.0.1:9103'
    const apiKey = process.env.SERVICE_API_KEY ?? 'local-dev-api-key'
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)

    try {
      const response = await fetch(`${paymentsServiceUrl}/payments/metrics`, {
        headers: {
          'X-API-Key': apiKey,
          'X-Actor-Role': 'admin',
        },
        signal: controller.signal,
        cache: 'no-store',
      })

      if (!response.ok) {
        const detail = await response.text()
        return { metrics: null, error: { code: 'payments_unavailable', detail } }
      }

      raw = (await response.json()) as Record<string, any>
      generatedAt = String(raw.generated_at ?? generatedAt)
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unknown_error'
      const code: 'payments_unavailable' | 'metrics_timeout' =
        error instanceof Error && error.name === 'AbortError' ? 'metrics_timeout' : 'payments_unavailable'
      return { metrics: null, error: { code, detail } }
    } finally {
      clearTimeout(timeout)
    }
  }

  const metrics: MetricsPayload = {
    generatedAt,
    payments: {
      total: Number(raw?.payments?.total ?? 0),
      held: toMetricBreakdown((raw?.payments?.held ?? null) as Record<string, unknown> | null),
      released: toMetricBreakdown((raw?.payments?.released ?? null) as Record<string, unknown> | null),
      refunded: toMetricBreakdown((raw?.payments?.refunded ?? null) as Record<string, unknown> | null),
      outstandingCents: Number(raw?.payments?.outstanding_cents ?? 0),
    },
    checkouts: {
      total: Number(raw?.checkouts?.total ?? 0),
      totalCents: Number(raw?.checkouts?.total_cents ?? 0),
      serviceFeeCents: Number(raw?.checkouts?.service_fee_cents ?? 0),
      averageOrderCents: Number(raw?.checkouts?.average_order_cents ?? 0),
      recent: Array.isArray(raw?.checkouts?.recent)
        ? (raw!.checkouts.recent as Record<string, unknown>[]).map(serializeCheckout)
        : [],
    },
    invoices: {
      total: Number(raw?.invoices?.total ?? 0),
      draft: Number(raw?.invoices?.draft ?? 0),
      issued: Number(raw?.invoices?.issued ?? 0),
      paid: Number(raw?.invoices?.paid ?? 0),
      voided: Number(raw?.invoices?.voided ?? 0),
      overdue: Number(raw?.invoices?.overdue ?? 0),
      outstandingCents: Number(raw?.invoices?.outstanding_cents ?? 0),
      totalCents: Number(raw?.invoices?.total_cents ?? 0),
    },
    accounts: {
      conveyancers,
      buyers,
      sellers,
      reviews,
    },
  }

  if (skipExternal) {
    return { metrics: { ...FALLBACK_METRICS, accounts: metrics.accounts, generatedAt } }
  }

  return { metrics }
}

export const loadMetricsOrFallback = async (options: { skipExternal?: boolean } = {}): Promise<MetricsPayload> => {
  const { metrics } = await loadMetrics(options)
  return metrics ?? FALLBACK_METRICS
}
