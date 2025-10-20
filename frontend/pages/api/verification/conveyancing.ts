import type { NextApiRequest, NextApiResponse } from 'next'

import { logServerError, serializeError } from '../../../lib/serverLogger'
import { requireAuth } from '../../../lib/session'
import { recordAuditEvent } from '../../../lib/audit'
import { recordVerificationEvent } from '../../../lib/services/identity'
import {
  type GovVerificationRequest,
  type GovVerificationResult,
  KycProviderUnavailableError,
  verifyLicenceWithProvider,
} from '../../../lib/kyc'

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  const user = requireAuth(req, res)
  if (!user) {
    return
  }

  if (user.role !== 'conveyancer') {
    res.status(403).json({ error: 'forbidden' })
    return
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    res.status(405).end('Method Not Allowed')
    return
  }

  const { licenceNumber, state, businessName } = req.body as {
    licenceNumber?: string
    state?: string
    businessName?: string
  }

  if (!licenceNumber || !state) {
    res.status(400).json({ error: 'missing_fields' })
    return
  }

  const request: GovVerificationRequest = {
    licenceNumber,
    state,
    businessName,
  }

  const toAuditValue = (value: unknown): unknown => {
    if (value === undefined) {
      return null
    }
    try {
      return JSON.parse(JSON.stringify(value))
    } catch (error) {
      return { value: String(value) }
    }
  }

  let result: GovVerificationResult
  try {
    result = await verifyLicenceWithProvider(request)
  } catch (error) {
    const providerError = error as KycProviderUnavailableError
    recordAuditEvent(user, {
      action: 'kyc_verification_error',
      entity: 'kyc_verification',
      entityId: user.id,
      metadata: {
        provider: providerError.providerId,
        request: toAuditValue(request),
        payload: toAuditValue(providerError.payload),
        error: providerError.message,
      },
    })
    logServerError('KYC provider request failed', {
      error: serializeError(error),
      provider: providerError.providerId,
    })
    res.status(502).json({ error: 'kyc_provider_unavailable' })
    return
  }

  const response = await recordVerificationEvent({
    userId: user.id,
    channel: 'conveyancing',
    metadata: {
      approved: result.approved,
      status: result.status,
      reference: result.reference,
      reason: result.reason ?? '',
      provider: result.provider,
    },
  })

  if (!result.approved) {
    recordAuditEvent(user, {
      action: 'kyc_verification_denied',
      entity: 'kyc_verification',
      entityId: user.id,
      metadata: {
        provider: result.provider,
        request: toAuditValue(request),
        response: toAuditValue(result.rawPayload),
        reason: result.reason ?? null,
        status: result.status,
      },
    })
  }

  res.status(200).json({
    ok: result.approved,
    status: result.status,
    reference: result.reference,
    reason: result.reason ?? null,
    verification: response.verification,
  })
}

export default handler
