import crypto from 'crypto'

export type GovVerificationRequest = {
  licenceNumber: string
  state: string
  businessName?: string
}

export type GovVerificationStatus = 'approved' | 'declined' | 'submitted'

export type GovVerificationResult = {
  approved: boolean
  reference: string
  status: GovVerificationStatus
  reason?: string | null
  provider: string
  rawPayload: unknown
}

type NormalizedProviderPayload = {
  approved: boolean
  status: GovVerificationStatus | 'pending'
  reference?: string | null
  reason?: string | null
}

const mockRegistry: Array<{
  licenceNumber: string
  state: string
  businessName: string
  active: boolean
}> = [
  { licenceNumber: 'VIC-SET-8821', state: 'VIC', businessName: 'Cora Conveyancer', active: true },
  { licenceNumber: 'NSW-CNV-4410', state: 'NSW', businessName: 'Sydney Settlements', active: true },
  { licenceNumber: 'QLD-SOL-9902', state: 'QLD', businessName: 'QLD Property Law', active: true },
  { licenceNumber: 'ACT-SOL-2211', state: 'ACT', businessName: 'Capital Conveyancing', active: false },
  { licenceNumber: 'NT-SOL-8891', state: 'NT', businessName: 'Northern Territory Solicitors', active: true },
]

const normalizeBusinessName = (value: string): string => value.trim().toLowerCase()

const generateReference = (): string => {
  const random = crypto.randomBytes(4).toString('hex').toUpperCase()
  return `AUS-GOV-${random}`
}

const resolveProvider = (): { id: string; endpoint?: string } => {
  const configured = process.env.KYC_PROVIDER?.trim()
  if (!configured || configured.length === 0 || configured.toLowerCase() === 'mock') {
    return { id: 'mock' }
  }

  if (configured.includes('://')) {
    return { id: configured, endpoint: configured }
  }

  return { id: configured, endpoint: `https://${configured}` }
}

const mockCheck = (request: GovVerificationRequest): GovVerificationResult => {
  const licence = request.licenceNumber.trim().toUpperCase()
  const state = request.state.trim().toUpperCase()
  const businessName = request.businessName ? normalizeBusinessName(request.businessName) : ''

  const entry = mockRegistry.find((item) => item.licenceNumber.toUpperCase() === licence)
  if (!entry) {
    return {
      approved: false,
      status: 'declined',
      reference: generateReference(),
      reason: 'Licence number not found in ASIC and Consumer Affairs registers.',
      provider: 'mock',
      rawPayload: null,
    }
  }

  if (entry.state.toUpperCase() !== state) {
    return {
      approved: false,
      status: 'declined',
      reference: generateReference(),
      reason: 'Licence jurisdiction mismatch with ASIC register.',
      provider: 'mock',
      rawPayload: null,
    }
  }

  if (businessName && normalizeBusinessName(entry.businessName) !== businessName) {
    return {
      approved: false,
      status: 'declined',
      reference: generateReference(),
      reason: 'Business name differs from government register.',
      provider: 'mock',
      rawPayload: null,
    }
  }

  if (!entry.active) {
    return {
      approved: false,
      status: 'declined',
      reference: generateReference(),
      reason: 'Licence is recorded as inactive or suspended.',
      provider: 'mock',
      rawPayload: null,
    }
  }

  return {
    approved: true,
    status: 'approved',
    reference: generateReference(),
    provider: 'mock',
    rawPayload: null,
  }
}

const computeSignatureHeader = (body: string, secret: string): string => {
  return crypto.createHmac('sha256', secret).update(body).digest('hex')
}

const normalizeProviderPayload = (payload: unknown): NormalizedProviderPayload => {
  if (payload && typeof payload === 'object') {
    const node = payload as Record<string, unknown>
    const approved = typeof node.approved === 'boolean' ? node.approved : undefined
    const statusCandidates = [node.status, node.decision, node.outcome]
      .filter((value) => typeof value === 'string')
      .map((value) => (value as string).toLowerCase())
    const explicitStatus = statusCandidates.find((value) => value.length > 0)
    const referenceCandidates = [node.reference, node.ref, node.caseId, node.requestId]
      .filter((value) => typeof value === 'string') as string[]
    const reasonCandidates = [node.reason, node.message, node.error, node.denialReason]
      .filter((value) => typeof value === 'string') as string[]

    const status: NormalizedProviderPayload['status'] = (() => {
      if (explicitStatus === 'approved' || explicitStatus === 'verified') {
        return 'approved'
      }
      if (explicitStatus === 'declined' || explicitStatus === 'rejected' || explicitStatus === 'failed') {
        return 'declined'
      }
      if (explicitStatus === 'pending' || explicitStatus === 'in_review' || explicitStatus === 'submitted') {
        return 'pending'
      }
      if (typeof approved === 'boolean') {
        return approved ? 'approved' : 'declined'
      }
      return 'pending'
    })()

    const normalized: NormalizedProviderPayload = {
      approved: status === 'approved',
      status,
      reference: referenceCandidates.length > 0 ? referenceCandidates[0] : undefined,
      reason: reasonCandidates.length > 0 ? reasonCandidates[0] : undefined,
    }

    return normalized
  }

  return { approved: false, status: 'pending', reference: null, reason: null }
}

const httpCheck = async (
  provider: { id: string; endpoint: string },
  request: GovVerificationRequest
): Promise<GovVerificationResult> => {
  const endpoint = provider.endpoint.replace(/\/$/, '')
  const payload = {
    licenceNumber: request.licenceNumber,
    state: request.state,
    businessName: request.businessName ?? null,
    channel: 'conveyancing',
  }
  const body = JSON.stringify(payload)
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  const secret = process.env.KYC_WEBHOOK_SECRET?.trim()
  if (secret) {
    headers['x-kyc-signature'] = computeSignatureHeader(body, secret)
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body,
  })

  const text = await response.text()
  let parsed: unknown = text
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text)
    } catch (error) {
      parsed = text
    }
  } else {
    parsed = null
  }

  if (!response.ok) {
    const error = new Error(`kyc_provider_${response.status}`)
    ;(error as Error & { providerId: string; payload: unknown }).providerId = provider.id
    ;(error as Error & { providerId: string; payload: unknown }).payload = parsed
    throw error
  }

  const normalized = normalizeProviderPayload(parsed)

  const status: GovVerificationStatus = normalized.status === 'pending' ? 'submitted' : normalized.status
  const reference = normalized.reference ?? generateReference()

  return {
    approved: normalized.approved,
    status,
    reference,
    reason: normalized.reason ?? null,
    provider: provider.id,
    rawPayload: parsed,
  }
}

export class KycProviderUnavailableError extends Error {
  providerId: string

  payload?: unknown

  constructor(message: string, providerId: string, payload?: unknown) {
    super(message)
    this.name = 'KycProviderUnavailableError'
    this.providerId = providerId
    this.payload = payload
  }
}

export const verifyLicenceWithProvider = async (
  request: GovVerificationRequest
): Promise<GovVerificationResult> => {
  const provider = resolveProvider()
  if (!provider.endpoint) {
    return mockCheck(request)
  }

  try {
    return await httpCheck(provider as { id: string; endpoint: string }, request)
  } catch (error) {
    const payload = (error as Error & { payload?: unknown }).payload
    const providerId = (error as Error & { providerId?: string }).providerId ?? provider.id
    throw new KycProviderUnavailableError(
      error instanceof Error ? error.message : 'kyc_provider_error',
      providerId,
      payload
    )
  }
}
