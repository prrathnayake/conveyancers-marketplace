import crypto from 'crypto'
import db from './db'
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
  signers: Array<{ name: string; email: string; completed: number; completedAt: string | null }>
}

const generateId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`

const hash = (value: string): string => crypto.createHash('sha256').update(value).digest('hex')

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

export const createSignatureEnvelope = (
  input: {
    jobId: string
    documentId: string
    provider: string
    signers: SignatureSignerInput[]
    actor: string
    correlationId: string
  }
): SignatureEnvelopeRecord => {
  const envelopeId = generateId('sig')
  const createdAt = new Date().toISOString()
  db.prepare(
    `INSERT INTO document_signatures (id, job_id, document_id, provider, status, created_at)
     VALUES (?, ?, ?, ?, 'pending', ?)`
  ).run(envelopeId, input.jobId, input.documentId, input.provider, createdAt)

  const signerStmt = db.prepare(
    `INSERT INTO document_signature_signers (id, signature_id, name, email, completed, completed_at)
     VALUES (?, ?, ?, ?, 0, NULL)`
  )
  for (const signer of input.signers) {
    signerStmt.run(generateId('sig_signer'), envelopeId, signer.name.trim(), signer.email.trim().toLowerCase())
  }

  recordAudit(envelopeId, 'envelope_created', input.actor, {
    correlationId: input.correlationId,
    provider: input.provider,
    signers: input.signers.map((s) => s.email),
  })

  return getSignatureEnvelope(envelopeId) as SignatureEnvelopeRecord
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
      `SELECT name, email, completed, completed_at AS completedAt
         FROM document_signature_signers WHERE signature_id = ? ORDER BY created_at`
    )
    .all(signatureId) as Array<{ name: string; email: string; completed: number; completedAt: string | null }>
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

export const completeSignatureEnvelope = (
  input: {
    signatureId: string
    certificate: string
    providerReference: string
    actor: string
    completedBy: Array<{ email: string; completedAt?: string }>
    correlationId: string
  }
): SignatureEnvelopeRecord | null => {
  const existing = getSignatureEnvelope(input.signatureId)
  if (!existing) {
    return null
  }
  const certificateHash = hash(input.certificate)
  const signedAt = new Date().toISOString()
  db.prepare(
    `UPDATE document_signatures
        SET status = 'signed', certificate_hash = ?, signed_at = ?, provider_reference = ?
      WHERE id = ?`
  ).run(certificateHash, signedAt, input.providerReference, input.signatureId)

  const updateSigner = db.prepare(
    `UPDATE document_signature_signers
        SET completed = 1, completed_at = ?
      WHERE signature_id = ? AND LOWER(email) = ?`
  )
  for (const signer of input.completedBy) {
    updateSigner.run(signer.completedAt ?? signedAt, input.signatureId, signer.email.trim().toLowerCase())
  }

  recordAudit(input.signatureId, 'envelope_signed', input.actor, {
    correlationId: input.correlationId,
    providerReference: input.providerReference,
    certificateHash,
  })

  return getSignatureEnvelope(input.signatureId)
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
