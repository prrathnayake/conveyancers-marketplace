import crypto from 'crypto'
import { randomUUID } from 'crypto'

export type ProviderEnvelopeSigner = {
  email: string
  name?: string | null
  signingUrl?: string | null
  completedAt?: string | null
}

export type ProviderCompletedSigner = {
  email: string
  completedAt?: string | null
}

export type ProviderEnvelope = {
  envelopeId: string
  providerReference?: string | null
  status?: string | null
  signers?: ProviderEnvelopeSigner[]
  completedBy?: ProviderCompletedSigner[]
  certificate?: string | null
  raw?: unknown
}

export type ProviderCertificate = {
  envelopeId: string
  providerReference?: string | null
  status?: string | null
  certificate: string
  completedBy?: ProviderCompletedSigner[]
  raw?: unknown
}

export interface ESignProviderClient {
  id: string
  createEnvelope(input: {
    jobId: string
    documentId: string
    signers: Array<{ name: string; email: string }>
  }): Promise<ProviderEnvelope>
  getEnvelope(envelopeId: string): Promise<ProviderEnvelope>
  downloadCertificate(envelopeId: string): Promise<ProviderCertificate>
}

export const computeWebhookSignature = (payload: string, secret: string): string => {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

const normalizeStatus = (status: unknown): string | undefined => {
  if (typeof status !== 'string' || status.trim().length === 0) {
    return undefined
  }
  const normalized = status.trim().toLowerCase()
  if (['completed', 'signed', 'finished'].includes(normalized)) {
    return 'signed'
  }
  if (['declined', 'voided', 'canceled', 'cancelled', 'rejected'].includes(normalized)) {
    return 'declined'
  }
  if (['sent', 'delivered', 'pending', 'created', 'in_progress', 'in-progress'].includes(normalized)) {
    return 'sent'
  }
  return status.trim()
}

const toStringIfPresent = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim()
  }
  return undefined
}

const normalizeEnvelopePayload = (payload: unknown, fallbackId?: string): ProviderEnvelope => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('esign_provider_invalid_payload')
  }
  const node = payload as Record<string, unknown>
  const idCandidates = [node.envelopeId, node.id, node.envelope_id, fallbackId]
  const envelopeIdCandidate = idCandidates
    .map(toStringIfPresent)
    .find((value): value is string => typeof value === 'string' && value.length > 0)
  if (!envelopeIdCandidate) {
    throw new Error('esign_provider_missing_envelope_id')
  }
  const providerReference = toStringIfPresent(node.providerReference) ?? toStringIfPresent(node.reference) ?? toStringIfPresent(node.externalId)
  const status = normalizeStatus(node.status ?? node.state)

  const signersNode = Array.isArray(node.signers)
    ? node.signers
    : Array.isArray(node.recipients)
      ? node.recipients
      : []

  const signers: ProviderEnvelopeSigner[] = []
  const completedBy: ProviderCompletedSigner[] = []

  for (const entry of signersNode) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const raw = entry as Record<string, unknown>
    const email =
      toStringIfPresent(raw.email) ??
      toStringIfPresent(raw.emailAddress) ??
      toStringIfPresent(raw.address) ??
      undefined
    if (!email) {
      continue
    }
    const signingUrl =
      toStringIfPresent(raw.signingUrl) ??
      toStringIfPresent(raw.url) ??
      toStringIfPresent(raw.recipientUrl) ??
      toStringIfPresent(raw.link) ??
      undefined
    const name = toStringIfPresent(raw.name) ?? toStringIfPresent(raw.fullName) ?? toStringIfPresent(raw.recipientName)
    const signerStatus = normalizeStatus(raw.status ?? raw.state)
    const completedAt =
      toStringIfPresent(raw.completedAt) ??
      toStringIfPresent(raw.completed_at) ??
      toStringIfPresent(raw.signedAt) ??
      undefined
    signers.push({
      email: email.toLowerCase(),
      name: name ?? null,
      signingUrl: signingUrl ?? null,
      completedAt: completedAt ?? null,
    })
    if (signerStatus === 'signed' || completedAt) {
      completedBy.push({ email: email.toLowerCase(), completedAt: completedAt ?? undefined })
    }
  }

  const explicitCompleted = Array.isArray(node.completed)
    ? node.completed
    : Array.isArray(node.completedBy)
      ? node.completedBy
      : []
  for (const entry of explicitCompleted) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const raw = entry as Record<string, unknown>
    const email = toStringIfPresent(raw.email) ?? toStringIfPresent(raw.emailAddress)
    if (!email) {
      continue
    }
    const completedAt =
      toStringIfPresent(raw.completedAt) ??
      toStringIfPresent(raw.completed_at) ??
      toStringIfPresent(raw.signedAt) ??
      undefined
    completedBy.push({ email: email.toLowerCase(), completedAt })
  }

  const certificate =
    toStringIfPresent(node.certificate) ??
    toStringIfPresent(node.certificateData) ??
    toStringIfPresent(node.certificateBase64) ??
    null

  return {
    envelopeId: envelopeIdCandidate,
    providerReference: providerReference ?? null,
    status: status ?? null,
    signers,
    completedBy,
    certificate,
    raw: payload,
  }
}

const createMockProvider = (): ESignProviderClient => {
  type MockEnvelope = {
    id: string
    providerReference: string
    status: string
    signers: Array<{ name: string; email: string; signingUrl: string; completedAt: string | null }>
    certificate?: string
  }

  const store = new Map<string, MockEnvelope>()

  const ensureEnvelope = (envelopeId: string): MockEnvelope => {
    const record = store.get(envelopeId)
    if (!record) {
      throw new Error('mock_envelope_not_found')
    }
    return record
  }

  return {
    id: 'mock',
    async createEnvelope(input) {
      const envelopeId = `mock_${randomUUID()}`
      const providerReference = `MOCK-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
      const signers = input.signers.map((signer, index) => ({
        name: signer.name.trim(),
        email: signer.email.trim().toLowerCase(),
        signingUrl: `https://mock-esign.local/envelopes/${encodeURIComponent(envelopeId)}/sign/${index + 1}`,
        completedAt: null,
      }))
      const record: MockEnvelope = {
        id: envelopeId,
        providerReference,
        status: 'sent',
        signers,
      }
      store.set(envelopeId, record)
      return {
        envelopeId,
        providerReference,
        status: record.status,
        signers: record.signers.map((signer) => ({
          email: signer.email,
          name: signer.name,
          signingUrl: signer.signingUrl,
          completedAt: signer.completedAt,
        })),
        completedBy: [],
        certificate: null,
        raw: record,
      }
    },
    async getEnvelope(envelopeId) {
      const record = ensureEnvelope(envelopeId)
      const completedBy = record.signers
        .filter((signer) => typeof signer.completedAt === 'string' && signer.completedAt.length > 0)
        .map((signer) => ({ email: signer.email, completedAt: signer.completedAt ?? undefined }))
      return {
        envelopeId: record.id,
        providerReference: record.providerReference,
        status: record.status,
        signers: record.signers.map((signer) => ({
          email: signer.email,
          name: signer.name,
          signingUrl: signer.signingUrl,
          completedAt: signer.completedAt,
        })),
        completedBy,
        certificate: record.certificate ?? null,
        raw: record,
      }
    },
    async downloadCertificate(envelopeId) {
      const record = ensureEnvelope(envelopeId)
      if (!record.certificate) {
        const completedAt = new Date().toISOString()
        for (const signer of record.signers) {
          if (!signer.completedAt) {
            signer.completedAt = completedAt
          }
        }
        record.status = 'signed'
        record.certificate = [
          '-----BEGIN MOCK CERTIFICATE-----',
          `Envelope: ${envelopeId}`,
          `Issued: ${completedAt}`,
          '-----END MOCK CERTIFICATE-----',
        ].join('\n')
      }
      const completedBy = record.signers.map((signer) => ({
        email: signer.email,
        completedAt: signer.completedAt ?? undefined,
      }))
      return {
        envelopeId: record.id,
        providerReference: record.providerReference,
        status: record.status,
        certificate: record.certificate,
        completedBy,
        raw: record,
      }
    },
  }
}

const createVendorProviderClient = (providerId: string): ESignProviderClient => {
  const baseUrl = process.env.ESIGN_VENDOR_BASE_URL?.trim()
  const apiKey = process.env.ESIGN_VENDOR_API_KEY?.trim()
  const apiSecret = process.env.ESIGN_VENDOR_API_SECRET?.trim()
  const apiPrefix = process.env.ESIGN_VENDOR_API_PREFIX?.trim() ?? '/v1'
  const accountId = process.env.ESIGN_VENDOR_ACCOUNT_ID?.trim() ?? null

  if (!baseUrl || baseUrl.length === 0) {
    throw new Error('esign_provider_missing_base_url')
  }
  if (!apiKey || apiKey.length === 0 || !apiSecret || apiSecret.length === 0) {
    throw new Error('esign_provider_missing_credentials')
  }

  const endpoint = baseUrl.replace(/\/$/, '')
  const authHeader = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')

  const request = async (path: string, options: { method?: string; body?: unknown } = {}) => {
    const method = options.method ?? 'GET'
    const headers: Record<string, string> = {
      accept: 'application/json',
      authorization: `Basic ${authHeader}`,
    }
    let bodyText: string | null = null
    if (options.body !== undefined) {
      bodyText = JSON.stringify(options.body)
      headers['content-type'] = 'application/json'
    }
    const response = await fetch(`${endpoint}${path}`, {
      method,
      headers,
      body: bodyText,
    })
    const text = await response.text()
    let payload: unknown = text
    if (text.length > 0) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = text
      }
    } else {
      payload = null
    }
    if (!response.ok) {
      const error = new Error(`esign_provider_${response.status}`)
      ;(error as Error & { payload?: unknown }).payload = payload
      throw error
    }
    return payload
  }

  const normalizePath = (target: string): string => {
    if (target.startsWith('http://') || target.startsWith('https://')) {
      return target
    }
    const normalizedPrefix = apiPrefix.startsWith('/') ? apiPrefix : `/${apiPrefix}`
    const normalizedTarget = target.startsWith('/') ? target : `/${target}`
    return `${normalizedPrefix}${normalizedTarget}`
  }

  return {
    id: providerId,
    async createEnvelope(input) {
      const payload = await request(
        normalizePath('/envelopes'),
        {
          method: 'POST',
          body: {
            externalId: input.jobId,
            documentId: input.documentId,
            signers: input.signers.map((signer) => ({
              name: signer.name,
              email: signer.email,
            })),
            ...(accountId ? { accountId } : {}),
          },
        }
      )
      return normalizeEnvelopePayload(payload)
    },
    async getEnvelope(envelopeId) {
      const payload = await request(normalizePath(`/envelopes/${encodeURIComponent(envelopeId)}`))
      return normalizeEnvelopePayload(payload, envelopeId)
    },
    async downloadCertificate(envelopeId) {
      const payload = await request(normalizePath(`/envelopes/${encodeURIComponent(envelopeId)}/certificate`))
      const normalized = normalizeEnvelopePayload(payload, envelopeId)
      if (!normalized.certificate || normalized.certificate.length === 0) {
        throw new Error('esign_provider_missing_certificate')
      }
      return {
        envelopeId: normalized.envelopeId,
        providerReference: normalized.providerReference ?? null,
        status: normalized.status ?? null,
        certificate: normalized.certificate,
        completedBy: normalized.completedBy ?? [],
        raw: payload,
      }
    },
  }
}

const createHttpProviderClient = (providerId: string, baseUrl: string, secret: string | null): ESignProviderClient => {
  const endpoint = baseUrl.replace(/\/$/, '')

  const signBody = (body: string | null): string | undefined => {
    if (!secret) {
      return undefined
    }
    return computeWebhookSignature(body ?? '', secret)
  }

  const request = async (path: string, options: { method?: string; body?: unknown } = {}) => {
    const method = options.method ?? 'GET'
    const headers: Record<string, string> = {
      accept: 'application/json',
    }
    let bodyText: string | null = null
    if (options.body !== undefined) {
      bodyText = JSON.stringify(options.body)
      headers['content-type'] = 'application/json'
    }
    const signature = signBody(bodyText)
    if (signature) {
      headers['x-esign-signature'] = signature
    }
    const response = await fetch(`${endpoint}${path}`, {
      method,
      headers,
      body: bodyText,
    })
    const text = await response.text()
    let payload: unknown = text
    if (text.length > 0) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = text
      }
    } else {
      payload = null
    }
    if (!response.ok) {
      const error = new Error(`esign_provider_${response.status}`)
      ;(error as Error & { payload?: unknown }).payload = payload
      throw error
    }
    return payload
  }

  return {
    id: providerId,
    async createEnvelope(input) {
      const payload = await request('/envelopes', {
        method: 'POST',
        body: {
          jobId: input.jobId,
          documentId: input.documentId,
          signers: input.signers,
        },
      })
      return normalizeEnvelopePayload(payload)
    },
    async getEnvelope(envelopeId) {
      const payload = await request(`/envelopes/${encodeURIComponent(envelopeId)}`)
      return normalizeEnvelopePayload(payload, envelopeId)
    },
    async downloadCertificate(envelopeId) {
      const payload = await request(`/envelopes/${encodeURIComponent(envelopeId)}/certificate`)
      const normalized = normalizeEnvelopePayload(payload, envelopeId)
      if (!normalized.certificate || normalized.certificate.length === 0) {
        throw new Error('esign_provider_missing_certificate')
      }
      return {
        envelopeId: normalized.envelopeId,
        providerReference: normalized.providerReference ?? null,
        status: normalized.status ?? null,
        certificate: normalized.certificate,
        completedBy: normalized.completedBy ?? [],
        raw: payload,
      }
    },
  }
}

const mockProvider = createMockProvider()
let cachedProvider: ESignProviderClient | null = null

export const resolveESignProvider = (): ESignProviderClient => {
  if (cachedProvider) {
    return cachedProvider
  }
  const configured = process.env.ESIGN_PROVIDER?.trim()
  if (!configured || configured.length === 0 || configured.toLowerCase() === 'mock') {
    cachedProvider = mockProvider
    return cachedProvider
  }
  const vendorBaseUrl = process.env.ESIGN_VENDOR_BASE_URL?.trim()
  if (vendorBaseUrl && vendorBaseUrl.length > 0) {
    cachedProvider = createVendorProviderClient(configured)
    return cachedProvider
  }
  const providerId = configured
  const baseUrl = configured.includes('://') ? configured : `https://${configured}`
  const secret = process.env.ESIGN_WEBHOOK_SECRET?.trim() ?? null
  cachedProvider = createHttpProviderClient(providerId, baseUrl, secret)
  return cachedProvider
}

export const resetEsignProviderCache = (): void => {
  cachedProvider = null
}
