import db from './db'

export type ConveyancerGovStatus = 'pending' | 'submitted' | 'approved' | 'declined'

export type VerificationSummary = {
  overallVerified: boolean
  email: { verified: boolean; verifiedAt: string | null }
  phone: { verified: boolean; phoneNumber: string | null; verifiedAt: string | null }
  conveyancing: {
    required: boolean
    status: ConveyancerGovStatus
    reference: string | null
    verifiedAt: string | null
    reason: string | null
  }
}

const normalizeStatus = (status: unknown): ConveyancerGovStatus => {
  if (status === 'submitted' || status === 'approved' || status === 'declined') {
    return status
  }
  return 'pending'
}

export const recomputeVerificationStatus = (userId: number): VerificationSummary => {
  const row = db
    .prepare(
      `SELECT id, role, email_verified_at, phone_verified_at, is_verified, phone
         FROM users WHERE id = ?`
    )
    .get(userId) as
    | {
        id: number
        role: 'buyer' | 'seller' | 'conveyancer' | 'admin'
        email_verified_at: string | null
        phone_verified_at: string | null
        is_verified: number
        phone: string | null
      }
    | undefined

  if (!row) {
    throw new Error('user_not_found')
  }

  let conveyancing: VerificationSummary['conveyancing'] = {
    required: row.role === 'conveyancer',
    status: 'pending',
    reference: null,
    verifiedAt: null,
    reason: null,
  }

  if (row.role === 'conveyancer') {
    const profile = db
      .prepare(
        `SELECT gov_status, gov_check_reference, gov_verified_at, gov_denial_reason, verified
           FROM conveyancer_profiles
          WHERE user_id = ?`
      )
      .get(userId) as
      | {
          gov_status: string | null
          gov_check_reference: string | null
          gov_verified_at: string | null
          gov_denial_reason: string | null
          verified: number
        }
      | undefined

    if (profile) {
      conveyancing = {
        required: true,
        status: normalizeStatus(profile.gov_status),
        reference: profile.gov_check_reference ?? null,
        verifiedAt: profile.gov_verified_at ?? null,
        reason: profile.gov_denial_reason ?? null,
      }
    }
  }

  const emailVerified = Boolean(row.email_verified_at)
  const phoneVerified = Boolean(row.phone_verified_at)
  const conveyancerVerified = conveyancing.required ? conveyancing.status === 'approved' : true
  const overall = emailVerified && phoneVerified && conveyancerVerified

  db.prepare('UPDATE users SET is_verified = ? WHERE id = ?').run(overall ? 1 : 0, userId)
  if (row.role === 'conveyancer') {
    db.prepare('UPDATE conveyancer_profiles SET verified = ? WHERE user_id = ?').run(overall ? 1 : 0, userId)
  }

  return {
    overallVerified: overall,
    email: { verified: emailVerified, verifiedAt: row.email_verified_at ?? null },
    phone: {
      verified: phoneVerified,
      phoneNumber: row.phone ?? null,
      verifiedAt: row.phone_verified_at ?? null,
    },
    conveyancing,
  }
}

export const getVerificationSummary = (userId: number): VerificationSummary => {
  const summary = recomputeVerificationStatus(userId)
  return summary
}
