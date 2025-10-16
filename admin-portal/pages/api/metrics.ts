import type { NextApiRequest, NextApiResponse } from 'next'

import db from '../../../frontend/lib/db'
import { requireRole } from '../../../frontend/lib/session'

type CheckoutReceipt = {
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

type MetricBreakdown = {
  count: number
  totalCents: number
}

type MetricsPayload = {
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

const toMetricBreakdown = (payload: Record<string, unknown>): MetricBreakdown => ({
  count: Number(payload.count ?? 0),
  totalCents: Number(payload.total_cents ?? 0),
})

export type { MetricsPayload }

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse<MetricsPayload | { error: string; detail?: string }>,
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

  const conveyancers = db.prepare("SELECT COUNT(1) AS total FROM users WHERE role = 'conveyancer'").get() as { total: number }
  const buyers = db.prepare("SELECT COUNT(1) AS total FROM users WHERE role = 'buyer'").get() as { total: number }
  const sellers = db.prepare("SELECT COUNT(1) AS total FROM users WHERE role = 'seller'").get() as { total: number }
  const reviews = db.prepare('SELECT COUNT(1) AS total FROM conveyancer_reviews').get() as { total: number }

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
      res.status(502).json({ error: 'payments_unavailable', detail })
      return
    }

    const raw = (await response.json()) as Record<string, any>
    const metrics: MetricsPayload = {
      generatedAt: String(raw.generated_at ?? ''),
      payments: {
        total: Number(raw.payments?.total ?? 0),
        held: toMetricBreakdown((raw.payments?.held ?? {}) as Record<string, unknown>),
        released: toMetricBreakdown((raw.payments?.released ?? {}) as Record<string, unknown>),
        refunded: toMetricBreakdown((raw.payments?.refunded ?? {}) as Record<string, unknown>),
        outstandingCents: Number(raw.payments?.outstanding_cents ?? 0),
      },
      checkouts: {
        total: Number(raw.checkouts?.total ?? 0),
        totalCents: Number(raw.checkouts?.total_cents ?? 0),
        serviceFeeCents: Number(raw.checkouts?.service_fee_cents ?? 0),
        averageOrderCents: Number(raw.checkouts?.average_order_cents ?? 0),
        recent: Array.isArray(raw.checkouts?.recent)
          ? (raw.checkouts.recent as Record<string, unknown>[]).map(serializeCheckout)
          : [],
      },
      invoices: {
        total: Number(raw.invoices?.total ?? 0),
        draft: Number(raw.invoices?.draft ?? 0),
        issued: Number(raw.invoices?.issued ?? 0),
        paid: Number(raw.invoices?.paid ?? 0),
        voided: Number(raw.invoices?.voided ?? 0),
        overdue: Number(raw.invoices?.overdue ?? 0),
        outstandingCents: Number(raw.invoices?.outstanding_cents ?? 0),
        totalCents: Number(raw.invoices?.total_cents ?? 0),
      },
      accounts: {
        conveyancers: conveyancers.total,
        buyers: buyers.total,
        sellers: sellers.total,
        reviews: reviews.total,
      },
    }

    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(metrics)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown_error'
    res.status(504).json({ error: 'metrics_timeout', detail })
  } finally {
    clearTimeout(timeout)
  }
}

export default handler
