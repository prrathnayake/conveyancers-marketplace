import type { NextApiResponse } from 'next'
import { requireRole } from '../../../frontend/lib/session'
import {
  createSignatureEnvelope,
  completeSignatureEnvelope,
  listSignatureAudit,
  getSignatureEnvelope,
  listSignaturesForDocument,
} from '../../../frontend/lib/signatures'
import { withObservability, type ObservedRequest } from '../../../frontend/lib/observability'

const handler = (req: ObservedRequest, res: NextApiResponse): void => {
  const actor = requireRole(req, res, ['admin'])
  if (!actor) {
    return
  }

  if (req.method === 'POST') {
    const { jobId, documentId, provider, signers } = req.body as {
      jobId?: string
      documentId?: string
      provider?: string
      signers?: Array<{ name?: string; email?: string }>
    }
    if (!jobId || !documentId || !provider || !Array.isArray(signers) || signers.length === 0) {
      res.status(400).json({ error: 'invalid_payload' })
      return
    }
    const normalizedSigners = signers
      .filter((signer) => signer?.email && signer?.name)
      .map((signer) => ({ name: signer!.name!.trim(), email: signer!.email!.trim() }))
    if (normalizedSigners.length === 0) {
      res.status(400).json({ error: 'invalid_signers' })
      return
    }
    const envelope = createSignatureEnvelope({
      jobId,
      documentId,
      provider,
      signers: normalizedSigners,
      actor: actor.email,
      correlationId: req.correlationId,
    })
    res.status(201).json(envelope)
    return
  }

  if (req.method === 'PUT') {
    const { id, certificate, providerReference, signers } = req.body as {
      id?: string
      certificate?: string
      providerReference?: string
      signers?: Array<{ email: string; completedAt?: string }>
    }
    if (!id || !certificate || !providerReference) {
      res.status(400).json({ error: 'invalid_payload' })
      return
    }
    const completedBy = Array.isArray(signers)
      ? signers.filter((entry) => entry.email).map((entry) => ({
          email: entry.email.trim(),
          completedAt: entry.completedAt,
        }))
      : []
    const envelope = completeSignatureEnvelope({
      signatureId: id,
      certificate,
      providerReference,
      actor: actor.email,
      completedBy,
      correlationId: req.correlationId,
    })
    if (!envelope) {
      res.status(404).json({ error: 'signature_not_found' })
      return
    }
    res.status(200).json(envelope)
    return
  }

  if (req.method === 'GET') {
    const { id, documentId, audit } = req.query as {
      id?: string
      documentId?: string
      audit?: string
    }
    if (id && audit === 'true') {
      res.status(200).json(listSignatureAudit(id))
      return
    }
    if (id) {
      const envelope = getSignatureEnvelope(id)
      if (!envelope) {
        res.status(404).json({ error: 'signature_not_found' })
        return
      }
      res.status(200).json(envelope)
      return
    }
    if (documentId) {
      res.status(200).json(listSignaturesForDocument(documentId))
      return
    }
    res.status(400).json({ error: 'missing_query' })
    return
  }

  res.setHeader('Allow', ['GET', 'POST', 'PUT'])
  res.status(405).end('Method Not Allowed')
}

export default withObservability(handler, { feature: 'admin_signature_management' })
