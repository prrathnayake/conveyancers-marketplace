import { createHmac, randomUUID } from 'crypto'

export type PspOperation = 'authorise' | 'capture' | 'refund'

export type PspRequestPayload = {
  invoiceId: number
  amountCents: number
  currency: string
  reference?: string
}

export type PspResponse = {
  success: boolean
  reference?: string
  status?: string
  failureReason?: string
}

type AdapterConfig = {
  provider: string
  secret: string
  endpoint?: string
}

const defaultEndpoint = process.env.PSP_ENDPOINT || process.env.PSP_BASE_URL || ''

const getConfig = (): AdapterConfig => {
  const provider = process.env.PSP_PROVIDER
  const secret = process.env.PSP_SECRET
  if (!provider || !secret) {
    throw new Error('PSP credentials missing')
  }
  return {
    provider,
    secret,
    endpoint: defaultEndpoint,
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

class PaymentServiceProviderAdapter {
  private readonly provider: string

  private readonly secret: string

  private readonly endpoint?: string

  constructor(config: AdapterConfig) {
    this.provider = config.provider
    this.secret = config.secret
    this.endpoint = config.endpoint
  }

  private signPayload(payload: Record<string, unknown>): string {
    const serialised = JSON.stringify(payload)
    return createHmac('sha256', this.secret).update(serialised).digest('hex')
  }

  private buildHeaders(payload: Record<string, unknown>) {
    return {
      'Content-Type': 'application/json',
      'X-PSP-Provider': this.provider,
      'X-PSP-Signature': this.signPayload(payload),
    }
  }

  private async dispatch(
    operation: PspOperation,
    payload: PspRequestPayload,
  ): Promise<PspResponse> {
    const requestPayload = {
      operation,
      provider: this.provider,
      timestamp: new Date().toISOString(),
      payload,
    }

    if (!this.endpoint) {
      return {
        success: true,
        reference: payload.reference ?? `mock-${operation}-${randomUUID()}`,
        status: operation === 'refund' ? 'refunded' : operation === 'capture' ? 'captured' : 'authorised',
      }
    }

    const response = await fetch(`${this.endpoint.replace(/\/$/, '')}/${operation}`, {
      method: 'POST',
      headers: this.buildHeaders(requestPayload),
      body: JSON.stringify(requestPayload),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`PSP ${operation} request failed (${response.status}): ${text}`)
    }

    const data = (await response.json()) as PspResponse | Record<string, unknown> | undefined
    if (!data || typeof data !== 'object') {
      return { success: false, failureReason: 'empty_response' }
    }

    if (typeof (data as PspResponse).success !== 'boolean') {
      return {
        success: false,
        reference: 'reference' in data ? String((data as { reference?: unknown }).reference ?? '') : undefined,
        status: 'status' in data ? String((data as { status?: unknown }).status ?? '') : undefined,
        failureReason: 'failureReason' in data
          ? String((data as { failureReason?: unknown }).failureReason ?? 'invalid_response')
          : 'invalid_response',
      }
    }

    return data as PspResponse
  }

  async execute(
    operation: PspOperation,
    payload: PspRequestPayload,
    attempts = 1,
  ): Promise<PspResponse> {
    let lastError: unknown
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const result = await this.dispatch(operation, payload)
        return result
      } catch (error) {
        lastError = error
        if (attempt < attempts - 1) {
          await sleep((attempt + 1) * 250)
        }
      }
    }

    if (lastError instanceof Error) {
      throw lastError
    }

    throw new Error('Unknown PSP error')
  }

  authorise(payload: PspRequestPayload, attempts = 1): Promise<PspResponse> {
    return this.execute('authorise', payload, attempts)
  }

  capture(payload: PspRequestPayload, attempts = 1): Promise<PspResponse> {
    return this.execute('capture', payload, attempts)
  }

  refund(payload: PspRequestPayload, attempts = 1): Promise<PspResponse> {
    return this.execute('refund', payload, attempts)
  }
}

let adapterInstance: PaymentServiceProviderAdapter | null = null

export const getPspAdapter = (): PaymentServiceProviderAdapter => {
  if (!adapterInstance) {
    adapterInstance = new PaymentServiceProviderAdapter(getConfig())
  }
  return adapterInstance
}

export default getPspAdapter
