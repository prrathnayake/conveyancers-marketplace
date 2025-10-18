import crypto from 'crypto'
import db from './db'
import { logTrace } from './observability'

export type TrustAccountRecord = {
  id: number
  conveyancerId: number
  accountName: string
  accountNumber: string
  bsb: string
  complianceStatus: string
  lastReconciledAt: string | null
  createdAt: string
  reports: Array<{
    id: string
    paymentId: string
    amountCents: number
    processedAt: string
    reviewer: string
    notes: string
    certificateHash: string
  }>
}

const digest = (value: string): string => crypto.createHash('sha256').update(value).digest('hex')

const normalizeBsb = (value: string): string => value.replace(/[^0-9]/g, '').slice(0, 6)

const normalizeAccountNumber = (value: string): string => value.replace(/\s+/g, '')

const mapAccount = (row: any): TrustAccountRecord => ({
  id: row.id as number,
  conveyancerId: row.conveyancer_id as number,
  accountName: row.account_name as string,
  accountNumber: row.account_number as string,
  bsb: row.bsb as string,
  complianceStatus: row.compliance_status as string,
  lastReconciledAt: (row.last_reconciled_at as string) ?? null,
  createdAt: row.created_at as string,
  reports: [],
})

export const listTrustAccounts = (): TrustAccountRecord[] => {
  const accounts = db
    .prepare(
      `SELECT id, conveyancer_id, account_name, account_number, bsb, compliance_status, last_reconciled_at, created_at
         FROM trust_accounts ORDER BY created_at DESC`
    )
    .all()
    .map(mapAccount)
  const reportStmt = db.prepare(
    `SELECT id, trust_account_id AS trustAccountId, payment_id AS paymentId, amount_cents AS amountCents,
            processed_at AS processedAt, reviewer, notes, certificate_hash AS certificateHash
       FROM trust_payout_reports WHERE trust_account_id = ? ORDER BY processed_at DESC`
  )
  for (const account of accounts) {
    account.reports = reportStmt.all(account.id) as TrustAccountRecord['reports']
  }
  return accounts
}

export const registerTrustAccount = (input: {
  conveyancerId: number
  accountName: string
  accountNumber: string
  bsb: string
  reviewer: string
  correlationId: string
}): TrustAccountRecord => {
  const normalizedAccount = normalizeAccountNumber(input.accountNumber)
  const normalizedBsb = normalizeBsb(input.bsb)
  db.prepare(
    `INSERT INTO trust_accounts (conveyancer_id, account_name, account_number, bsb, compliance_status, last_reconciled_at)
     VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
     ON CONFLICT(account_number, bsb) DO UPDATE SET
       conveyancer_id = excluded.conveyancer_id,
       account_name = excluded.account_name,
       compliance_status = 'active',
       last_reconciled_at = CURRENT_TIMESTAMP`
  ).run(input.conveyancerId, input.accountName.trim(), normalizedAccount, normalizedBsb)
  logTrace(input.correlationId, 'trust_account_registered', {
    conveyancerId: input.conveyancerId,
    accountNumber: normalizedAccount,
    bsb: normalizedBsb,
    reviewer: input.reviewer,
  })
  const account = db
    .prepare(
      `SELECT id, conveyancer_id, account_name, account_number, bsb, compliance_status, last_reconciled_at, created_at
         FROM trust_accounts WHERE account_number = ? AND bsb = ?`
    )
    .get(normalizedAccount, normalizedBsb)
  if (!account) {
    throw new Error('trust_account_not_persisted')
  }
  return mapAccount(account)
}

export const reconcileTrustAccount = (input: {
  accountId: number
  status: 'active' | 'suspended' | 'requires_attention'
  correlationId: string
  reviewer: string
}): void => {
  db.prepare(
    `UPDATE trust_accounts SET compliance_status = ?, last_reconciled_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(input.status, input.accountId)
  logTrace(input.correlationId, 'trust_account_reconciled', {
    accountId: input.accountId,
    status: input.status,
    reviewer: input.reviewer,
  })
}

export const recordTrustPayout = (input: {
  accountId: number
  paymentId: string
  amountCents: number
  processedAt: string
  reviewer: string
  notes?: string
  correlationId: string
}): void => {
  const payload = JSON.stringify({
    accountId: input.accountId,
    paymentId: input.paymentId,
    amountCents: input.amountCents,
    processedAt: input.processedAt,
    reviewer: input.reviewer,
    notes: input.notes ?? '',
  })
  db.prepare(
    `INSERT INTO trust_payout_reports (id, trust_account_id, payment_id, amount_cents, processed_at, reviewer, notes, certificate_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    `payout_${crypto.randomUUID()}`,
    input.accountId,
    input.paymentId,
    input.amountCents,
    input.processedAt,
    input.reviewer,
    input.notes ?? '',
    digest(payload)
  )
  logTrace(input.correlationId, 'trust_payout_recorded', {
    accountId: input.accountId,
    paymentId: input.paymentId,
    amountCents: input.amountCents,
  })
}
