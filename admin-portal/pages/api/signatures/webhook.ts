import crypto from 'crypto'
import type { NextApiResponse } from 'next'
import { computeWebhookSignature } from '../../../../../frontend/lib/esign'
import {
  ingestSignatureWebhookEvent,
  flagSignatureEnvelopeForManualReconciliation,
  syncSignatureEnvelopeFromProvider,
} from '../../../../../frontend/lib/signatures'
import { withObservability, type ObservedRequest } from '../../../../../frontend/lib/observability'

const readRawBody = async (req: ObservedRequest): Promise<string> => {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk))
    } else {
      chunks.push(chunk)
    }
  }
  return Buffer.concat(chunks).toString('utf8')
}

const safeCompare = (expected: string, provided: string): boolean => {
  if (expected.length === 0 || provided.length === 0) {
    return expected === provided
  }
  const expectedBuffer = Buffer.from(expected, 'utf8')
  const providedBuffer = Buffer.from(provided, 'utf8')
  if (expectedBuffer.length !== providedBuffer.length) {
    return false
  }
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer)
}

const stringOrUndefined = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim()
  }
  return undefined
}

const handler = async (req: ObservedRequest, res: NextApiResponse): Promise<void> => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    res.status(405).end('Method Not Allowed')
    return
  }

  const secret = process.env.ESIGN_WEBHOOK_SECRET?.trim() ?? ''
  const rawBody = await readRawBody(req)
  const signatureHeader = req.headers['x-esign-signature']
  const providedSignature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader ?? ''

  if (secret) {
    const expectedSignature = computeWebhookSignature(rawBody, secret)
    if (!safeCompare(expectedSignature, providedSignature)) {
      let envelopeId: string | undefined
      try {
        const parsed = rawBody.length > 0 ? JSON.parse(rawBody) : null
        if (parsed && typeof parsed === 'object') {
          envelopeId =
            stringOrUndefined((parsed as Record<string, unknown>).envelopeId) ??
            stringOrUndefined((parsed as Record<string, unknown>).id) ??
            stringOrUndefined((parsed as Record<string, unknown>).envelope_id)
        }
      } catch {
        envelopeId = undefined
      }
      if (envelopeId) {
        flagSignatureEnvelopeForManualReconciliation(envelopeId, 'invalid_signature', 'esign:webhook', req.correlationId)
      }
      res.status(401).json({ error: 'invalid_signature' })
      return
    }
  }

  let payload: unknown
  try {
    payload = rawBody.length > 0 ? JSON.parse(rawBody) : {}
  } catch {
    res.status(400).json({ error: 'invalid_json' })
    return
  }

  if (!payload || typeof payload !== 'object') {
    res.status(400).json({ error: 'invalid_payload' })
    return
  }

  const node = payload as Record<string, unknown>
  const envelopeId =
    stringOrUndefined(node.envelopeId) ??
    stringOrUndefined(node.id) ??
    stringOrUndefined(node.envelope_id)

  if (!envelopeId) {
    res.status(400).json({ error: 'missing_envelope_id' })
    return
  }

  const signerNodes = Array.isArray(node.signers)
    ? node.signers
    : Array.isArray(node.recipients)
      ? node.recipients
      : []

  const signerUpdates = signerNodes
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const raw = entry as Record<string, unknown>
      const email =
        stringOrUndefined(raw.email) ??
        stringOrUndefined(raw.emailAddress) ??
        stringOrUndefined(raw.address)
      if (!email) {
        return null
      }
      return {
        email: email.toLowerCase(),
        name: stringOrUndefined(raw.name) ?? stringOrUndefined(raw.fullName) ?? stringOrUndefined(raw.recipientName) ?? null,
        signingUrl:
          stringOrUndefined(raw.signingUrl) ??
          stringOrUndefined(raw.url) ??
          stringOrUndefined(raw.recipientUrl) ??
          stringOrUndefined(raw.link) ??
          null,
        status: stringOrUndefined(raw.status) ?? stringOrUndefined(raw.state) ?? undefined,
        completedAt:
          stringOrUndefined(raw.completedAt) ??
          stringOrUndefined(raw.completed_at) ??
          stringOrUndefined(raw.signedAt) ??
          undefined,
      }
    })
    .filter((entry): entry is {
      email: string
      name: string | null
      signingUrl: string | null
      status?: string
      completedAt?: string
    } => entry !== null)

  const completedNodes = Array.isArray(node.completed)
    ? node.completed
    : Array.isArray(node.completedBy)
      ? node.completedBy
      : []

  const completed = completedNodes
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const raw = entry as Record<string, unknown>
      const email = stringOrUndefined(raw.email) ?? stringOrUndefined(raw.emailAddress)
      if (!email) {
        return null
      }
      return {
        email: email.toLowerCase(),
        completedAt:
          stringOrUndefined(raw.completedAt) ??
          stringOrUndefined(raw.completed_at) ??
          stringOrUndefined(raw.signedAt) ??
          undefined,
      }
    })
    .filter((entry): entry is { email: string; completedAt?: string } => entry !== null)

  const status = stringOrUndefined(node.status) ?? stringOrUndefined(node.state)
  const providerReference =
    stringOrUndefined(node.providerReference) ??
    stringOrUndefined(node.reference) ??
    stringOrUndefined(node.externalId)
  const certificate =
    stringOrUndefined(node.certificate) ??
    stringOrUndefined(node.certificateData) ??
    stringOrUndefined(node.certificateBase64) ??
    undefined

  try {
    const updated = ingestSignatureWebhookEvent({
      signatureId: envelopeId,
      status,
      providerReference,
      certificate: certificate ?? null,
      signers: signerUpdates,
      completed,
      actor: 'esign:webhook',
      correlationId: req.correlationId,
      source: stringOrUndefined(node.event) ?? stringOrUndefined(node.type) ?? 'webhook',
    })

    if (!updated) {
      flagSignatureEnvelopeForManualReconciliation(envelopeId, 'unknown_envelope', 'esign:webhook', req.correlationId)
      res.status(202).json({ ok: false })
      return
    }

    if (!certificate && (status ?? '').toLowerCase() === 'signed') {
      await syncSignatureEnvelopeFromProvider({
        signatureId: envelopeId,
        actor: 'esign:webhook',
        correlationId: req.correlationId,
        includeCertificate: true,
        source: 'webhook_reconciliation',
      })
    }

    res.status(200).json({ ok: true })
  } catch (error) {
    flagSignatureEnvelopeForManualReconciliation(envelopeId, 'processing_error', 'esign:webhook', req.correlationId)
    res.status(202).json({
      ok: false,
      error: error instanceof Error ? error.message : 'unknown_error',
    })
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
}

export default withObservability(handler, { feature: 'esign_webhook' })
