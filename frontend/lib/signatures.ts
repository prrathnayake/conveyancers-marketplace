import crypto from 'crypto'
import db from './db'
import { resolveESignProvider, type ProviderEnvelopeSigner } from './esign'
import { logTrace } from './observability'

export type SignatureSignerInput = {
  name: string
  email: string
}

export type SignatureEnvelopeRecord = {
  id: string
  jobId: string
  documentId: string
  provider: string
  status: string
  providerReference: string
  certificateHash: string
  signedAt: string | null
  createdAt: string
  signers: Array<{
    name: string
    email: string
    signingUrl: string
    completed: number
    completedAt: string | null
  }>
}

const generateId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`

const hash = (value: string): string => crypto.createHash('sha256').update(value).digest('hex')

const ensureRealProvider = (client: { id: string }, operation: string): void => {
  if (client.id === 'mock' && process.env.NODE_ENV === 'production') {
    throw new Error(`esign_provider_not_configured.${operation}`)
  }
}

const latestAuditHash = (signatureId: string): string => {
  const row = db
    .prepare(
      `SELECT entry_hash AS entryHash FROM document_signature_audit
       WHERE signature_id = ? ORDER BY created_at DESC LIMIT 1`
    )
    .get(signatureId) as { entryHash: string } | undefined
  return row?.entryHash ?? ''
}

const recordAudit = (
  signatureId: string,
  action: string,
  actor: string,
  metadata: Record<string, unknown>
): void => {
  const timestamp = new Date().toISOString()
  const previousHash = latestAuditHash(signatureId)
  const entryHash = hash(`${previousHash}:${signatureId}:${action}:${actor}:${timestamp}:${JSON.stringify(metadata)}`)
  db.prepare(
    `INSERT INTO document_signature_audit (id, signature_id, action, actor, metadata, created_at, previous_hash, entry_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(generateId('sig_audit'), signatureId, action, actor, JSON.stringify(metadata), timestamp, previousHash, entryHash)
  const correlationId = (metadata?.correlationId as string | undefined) ?? signatureId
  logTrace(correlationId, 'signature_audit', {
    signatureId,
    action,
    actor,
    entryHash,
  })
}

const normalizeSignerKey = (email: string): string => email.trim().toLowerCase()

const normalizeSigningUrl = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const mergeSignerDetails = (
  base: SignatureSignerInput[],
  providerSigners: ProviderEnvelopeSigner[] | undefined
): Array<{ name: string; email: string; signingUrl: string }> => {
  const results = new Map<string, { name: string; email: string; signingUrl: string }>()

  for (const signer of base) {
    const email = normalizeSignerKey(signer.email)
    results.set(email, {
      name: signer.name.trim(),
      email,
      signingUrl: '',
    })
  }

  if (providerSigners) {
    for (const signer of providerSigners) {
      if (!signer?.email) {
        continue
      }
      const email = normalizeSignerKey(String(signer.email))
      const existing = results.get(email)
      const rawSigner = signer as Record<string, unknown>
      const signingUrlCandidate =
        normalizeSigningUrl(signer.signingUrl) ??
        normalizeSigningUrl(rawSigner.url) ??
        normalizeSigningUrl(rawSigner.recipientUrl) ??
        normalizeSigningUrl(rawSigner.link)
      results.set(email, {
        name:
          typeof signer.name === 'string' && signer.name.trim().length > 0
            ? signer.name.trim()
            : existing?.name ?? email,
        email,
        signingUrl: signingUrlCandidate ?? existing?.signingUrl ?? '',
      })
    }
  }

  return Array.from(results.values())
}

const normalizeCompletedSigners = (
  completedBy?: Array<{ email: string; completedAt?: string | null }>
): Array<{ email: string; completedAt?: string }> => {
  if (!completedBy) {
    return []
  }
  const seen = new Map<string, { email: string; completedAt?: string }>()
  for (const signer of completedBy) {
    if (!signer?.email) {
      continue
    }
    const email = normalizeSignerKey(String(signer.email))
    const completedAt =
      typeof signer.completedAt === 'string' && signer.completedAt.length > 0
        ? signer.completedAt
        : undefined
    seen.set(email, { email, completedAt })
  }
  return Array.from(seen.values())
}

const applySignatureEnvelopeUpdate = (
  signatureId: string,
  update: {
    status?: string | null
    providerReference?: string | null
    signerLinks?: Array<{ email: string; signingUrl?: string | null; name?: string | null }>
    completedBy?: Array<{ email: string; completedAt?: string }>
    certificate?: string | null
  },
  actor: string,
  correlationId: string,
  source: string
): SignatureEnvelopeRecord | null => {
  const existing = getSignatureEnvelope(signatureId)
  if (!existing) {
    return null
  }

  let certificateHashForAudit: string | null = null
  let statusForAudit = existing.status
  let providerReferenceForAudit = existing.providerReference

  const tx = db.transaction(() => {
    if (update.status || update.providerReference || update.certificate) {
      const targetStatus = update.status?.trim() ?? existing.status
      const providerReference = update.providerReference ?? existing.providerReference
      let certificateHash = existing.certificateHash
      let signedAt: string | null = null
      if (typeof update.certificate === 'string' && update.certificate.length > 0) {
        certificateHash = hash(update.certificate)
        certificateHashForAudit = certificateHash
        const completions = (update.completedBy ?? [])
          .map((entry) => entry.completedAt)
          .filter((value): value is string => typeof value === 'string' && value.length > 0)
        signedAt = completions.length > 0 ? completions.sort().slice(-1)[0] : new Date().toISOString()
      }
      db.prepare(
        `UPDATE document_signatures
            SET status = ?, provider_reference = ?, certificate_hash = ?, signed_at = COALESCE(?, signed_at)
          WHERE id = ?`
      ).run(targetStatus, providerReference, certificateHash, signedAt, signatureId)
      statusForAudit = targetStatus
      providerReferenceForAudit = providerReference
    }

    if (update.signerLinks && update.signerLinks.length > 0) {
      const statement = db.prepare(
        `UPDATE document_signature_signers
            SET name = CASE WHEN ? <> '' THEN ? ELSE name END,
                signing_url = COALESCE(?, signing_url)
          WHERE signature_id = ? AND LOWER(email) = ?`
      )
      for (const signer of update.signerLinks) {
        if (!signer?.email) {
          continue
        }
        const email = normalizeSignerKey(String(signer.email))
        const signingUrl = normalizeSigningUrl(signer.signingUrl) ?? null
        const name = typeof signer.name === 'string' ? signer.name.trim() : ''
        statement.run(name, name, signingUrl, signatureId, email)
      }
    }

    if (update.completedBy && update.completedBy.length > 0) {
      const statement = db.prepare(
        `UPDATE document_signature_signers
            SET completed = 1, completed_at = COALESCE(?, completed_at)
          WHERE signature_id = ? AND LOWER(email) = ?`
      )
      for (const signer of update.completedBy) {
        const email = normalizeSignerKey(signer.email)
        statement.run(signer.completedAt ?? new Date().toISOString(), signatureId, email)
      }
    }
  })

  tx()

  recordAudit(signatureId, `provider_update.${source}`, actor, {
    correlationId,
    status: statusForAudit,
    providerReference: providerReferenceForAudit,
    certificateHash: certificateHashForAudit ?? existing.certificateHash,
    signerLinks: update.signerLinks?.map((entry) => ({
      email: normalizeSignerKey(entry.email),
      signingUrl: entry.signingUrl ?? null,
    })),
    completedBy: update.completedBy ?? [],
  })

  return getSignatureEnvelope(signatureId)
}

export const createSignatureEnvelope = async (
  input: {
    jobId: string
    documentId: string
    signers: SignatureSignerInput[]
    actor: string
    correlationId: string
  }
): Promise<SignatureEnvelopeRecord> => {
  const providerClient = resolveESignProvider()
  ensureRealProvider(providerClient, 'create')
  const providerEnvelope = await providerClient.createEnvelope({
    jobId: input.jobId,
    documentId: input.documentId,
    signers: input.signers,
  })

  const envelopeId = providerEnvelope.envelopeId
  const createdAt = new Date().toISOString()
  const providerReference = providerEnvelope.providerReference ?? ''
  const status = providerEnvelope.status ?? 'pending'
  const signers = mergeSignerDetails(input.signers, providerEnvelope.signers)

  db.prepare(
    `INSERT INTO document_signatures (id, job_id, document_id, provider, status, provider_reference, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(envelopeId, input.jobId, input.documentId, providerClient.id, status, providerReference, createdAt)

  const deleteSigners = db.prepare('DELETE FROM document_signature_signers WHERE signature_id = ?')
  deleteSigners.run(envelopeId)

  const signerStmt = db.prepare(
    `INSERT INTO document_signature_signers (id, signature_id, name, email, signing_url, completed, completed_at)
     VALUES (?, ?, ?, ?, ?, 0, NULL)`
  )
  for (const signer of signers) {
    signerStmt.run(
      generateId('sig_signer'),
      envelopeId,
      signer.name,
      signer.email,
      signer.signingUrl ?? ''
    )
  }

  recordAudit(envelopeId, 'envelope_created', input.actor, {
    correlationId: input.correlationId,
    provider: providerClient.id,
    providerReference,
    status,
    signers: signers.map((s) => ({ email: s.email, signingUrl: s.signingUrl })),
  })

  const created = getSignatureEnvelope(envelopeId)
  if (!created) {
    throw new Error('signature_envelope_creation_failed')
  }
  return created
}

export const getSignatureEnvelope = (signatureId: string): SignatureEnvelopeRecord | null => {
  const row = db
    .prepare(
      `SELECT id, job_id AS jobId, document_id AS documentId, provider, status, provider_reference AS providerReference,
              certificate_hash AS certificateHash, signed_at AS signedAt, created_at AS createdAt
         FROM document_signatures
        WHERE id = ?`
    )
    .get(signatureId) as
    | {
        id: string
        jobId: string
        documentId: string
        provider: string
        status: string
        providerReference: string
        certificateHash: string
        signedAt: string | null
        createdAt: string
      }
    | undefined
  if (!row) {
    return null
  }
  const signers = db
    .prepare(
      `SELECT name, email, signing_url AS signingUrl, completed, completed_at AS completedAt
         FROM document_signature_signers WHERE signature_id = ? ORDER BY created_at`
    )
    .all(signatureId) as Array<{
      name: string
      email: string
      signingUrl: string
      completed: number
      completedAt: string | null
    }>
  return { ...row, signers }
}

export const listSignaturesForDocument = (documentId: string): SignatureEnvelopeRecord[] => {
  const rows = db
    .prepare(
      `SELECT id FROM document_signatures WHERE document_id = ? ORDER BY created_at DESC`
    )
    .all(documentId) as Array<{ id: string }>
  const results: SignatureEnvelopeRecord[] = []
  for (const row of rows) {
    const envelope = getSignatureEnvelope(row.id)
    if (envelope) {
      results.push(envelope)
    }
  }
  return results
}

export const completeSignatureEnvelope = async (
  input: {
    signatureId: string
    actor: string
    correlationId: string
  }
): Promise<SignatureEnvelopeRecord | null> => {
  const existing = getSignatureEnvelope(input.signatureId)
  if (!existing) {
    return null
  }

  await syncSignatureEnvelopeFromProvider({
    signatureId: input.signatureId,
    actor: input.actor,
    correlationId: input.correlationId,
    includeCertificate: false,
    source: 'manual_completion.preflight',
  })

  const providerClient = resolveESignProvider()
  ensureRealProvider(providerClient, 'certificate')
  const certificateDetails = await providerClient.downloadCertificate(input.signatureId)
  const completedBy = normalizeCompletedSigners(certificateDetails.completedBy)

  return applySignatureEnvelopeUpdate(
    input.signatureId,
    {
      status: certificateDetails.status ?? 'signed',
      providerReference: certificateDetails.providerReference ?? existing.providerReference,
      completedBy,
      certificate: certificateDetails.certificate,
    },
    input.actor,
    input.correlationId,
    'manual_completion'
  )
}

export const syncSignatureEnvelopeFromProvider = async (input: {
  signatureId: string
  actor: string
  correlationId: string
  includeCertificate?: boolean
  source?: string
}): Promise<SignatureEnvelopeRecord | null> => {
  const existing = getSignatureEnvelope(input.signatureId)
  if (!existing) {
    return null
  }

  const providerClient = resolveESignProvider()
  const remote = await providerClient.getEnvelope(input.signatureId)
  const signerLinks = remote.signers?.map((signer) => {
    const rawSigner = signer as Record<string, unknown>
    return {
      email: normalizeSignerKey(String(signer.email)),
      signingUrl:
        normalizeSigningUrl(signer.signingUrl) ??
        normalizeSigningUrl(rawSigner.url) ??
        normalizeSigningUrl(rawSigner.recipientUrl) ??
        normalizeSigningUrl(rawSigner.link),
      name: typeof signer.name === 'string' ? signer.name : undefined,
    }
  })
  const completedBy = normalizeCompletedSigners(remote.completedBy)
  let certificate: string | null = remote.certificate ?? null
  let status = remote.status ?? existing.status
  let providerReference = remote.providerReference ?? existing.providerReference

  if (input.includeCertificate && !certificate) {
    ensureRealProvider(providerClient, 'certificate')
    try {
      const certificateDetails = await providerClient.downloadCertificate(input.signatureId)
      certificate = certificateDetails.certificate
      status = certificateDetails.status ?? status
      providerReference = certificateDetails.providerReference ?? providerReference
      const certificateCompleted = normalizeCompletedSigners(certificateDetails.completedBy)
      if (certificateCompleted.length > 0) {
        completedBy.push(...certificateCompleted)
      }
    } catch (error) {
      recordAudit(input.signatureId, 'provider_certificate_download_failed', input.actor, {
        correlationId: input.correlationId,
        error: error instanceof Error ? error.message : 'unknown_error',
      })
    }
  }

  return applySignatureEnvelopeUpdate(
    input.signatureId,
    {
      status,
      providerReference,
      signerLinks,
      completedBy,
      certificate,
    },
    input.actor,
    input.correlationId,
    input.source ?? 'provider_poll'
  )
}

export const ingestSignatureWebhookEvent = (
  input: {
    signatureId: string
    status?: string
    providerReference?: string
    certificate?: string | null
    signers?: Array<{ email: string; signingUrl?: string | null; name?: string | null; status?: string; completedAt?: string }>
    completed?: Array<{ email: string; completedAt?: string }>
    actor: string
    correlationId: string
    source?: string
  }
): SignatureEnvelopeRecord | null => {
  const signerLinks = input.signers?.map((signer) => ({
    email: normalizeSignerKey(signer.email),
    signingUrl:
      normalizeSigningUrl(signer.signingUrl) ??
      (typeof signer.status === 'string' && signer.status.toLowerCase() === 'completed'
        ? normalizeSigningUrl(signer.signingUrl) ?? ''
        : undefined),
    name: signer.name ?? null,
  }))

  const explicitCompleted: Array<{ email: string; completedAt?: string }> = Array.isArray(input.completed)
    ? [...input.completed]
    : []

  for (const signer of input.signers ?? []) {
    if (!signer.email) {
      continue
    }
    const status = signer.status?.toLowerCase()
    if (status === 'completed' || status === 'signed') {
      explicitCompleted.push({ email: normalizeSignerKey(signer.email), completedAt: signer.completedAt })
    }
  }

  const completedBy = normalizeCompletedSigners(explicitCompleted)

  return applySignatureEnvelopeUpdate(
    input.signatureId,
    {
      status: input.status,
      providerReference: input.providerReference,
      certificate: input.certificate ?? null,
      signerLinks,
      completedBy,
    },
    input.actor,
    input.correlationId,
    input.source ?? 'webhook'
  )
}

export const flagSignatureEnvelopeForManualReconciliation = (
  signatureId: string,
  reason: string,
  actor: string,
  correlationId: string
): SignatureEnvelopeRecord | null => {
  const existing = getSignatureEnvelope(signatureId)
  if (!existing) {
    return null
  }

  if (existing.status !== 'signed') {
    db.prepare(
      `UPDATE document_signatures
          SET status = 'pending_manual_review'
        WHERE id = ? AND status <> 'signed'`
    ).run(signatureId)
  }

  recordAudit(signatureId, 'webhook_failed', actor, {
    correlationId,
    reason,
  })

  return getSignatureEnvelope(signatureId)
}

export const listSignatureAudit = (signatureId: string): Array<{
  id: string
  action: string
  actor: string
  metadata: string
  createdAt: string
  previousHash: string
  entryHash: string
}> => {
  return db
    .prepare(
      `SELECT id, action, actor, metadata, created_at AS createdAt, previous_hash AS previousHash, entry_hash AS entryHash
         FROM document_signature_audit WHERE signature_id = ? ORDER BY created_at`
    )
    .all(signatureId) as Array<{
    id: string
    action: string
    actor: string
    metadata: string
    createdAt: string
    previousHash: string
    entryHash: string
  }>
}
