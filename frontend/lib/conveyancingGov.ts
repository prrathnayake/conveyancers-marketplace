import crypto from 'crypto'

export type GovVerificationRequest = {
  licenceNumber: string
  state: string
  businessName?: string
}

export type GovVerificationResult = {
  approved: boolean
  reference: string
  status: 'approved' | 'declined'
  reason?: string
}

type RegistryEntry = {
  licenceNumber: string
  state: string
  businessName: string
  active: boolean
}

const registry: RegistryEntry[] = [
  { licenceNumber: 'VIC-SET-8821', state: 'VIC', businessName: 'Cora Conveyancer', active: true },
  { licenceNumber: 'NSW-CNV-4410', state: 'NSW', businessName: 'Sydney Settlements', active: true },
  { licenceNumber: 'QLD-SOL-9902', state: 'QLD', businessName: 'QLD Property Law', active: true },
  { licenceNumber: 'ACT-SOL-2211', state: 'ACT', businessName: 'Capital Conveyancing', active: false },
  { licenceNumber: 'NT-SOL-8891', state: 'NT', businessName: 'Northern Territory Solicitors', active: true },
]

const normalize = (value: string): string => value.trim().toLowerCase()

const generateReference = (): string => {
  const random = crypto.randomBytes(4).toString('hex').toUpperCase()
  return `AUS-GOV-${random}`
}

export const verifyLicenceAgainstRegistry = (
  request: GovVerificationRequest
): GovVerificationResult => {
  const licence = request.licenceNumber.trim().toUpperCase()
  const state = request.state.trim().toUpperCase()
  const businessName = request.businessName ? normalize(request.businessName) : ''

  const entry = registry.find((item) => item.licenceNumber.toUpperCase() === licence)
  if (!entry) {
    return {
      approved: false,
      status: 'declined',
      reference: generateReference(),
      reason: 'Licence number not found in ASIC and Consumer Affairs registers.',
    }
  }

  if (entry.state.toUpperCase() !== state) {
    return {
      approved: false,
      status: 'declined',
      reference: generateReference(),
      reason: 'Licence jurisdiction mismatch with ASIC register.',
    }
  }

  if (businessName && normalize(entry.businessName) !== businessName) {
    return {
      approved: false,
      status: 'declined',
      reference: generateReference(),
      reason: 'Business name differs from government register.',
    }
  }

  if (!entry.active) {
    return {
      approved: false,
      status: 'declined',
      reference: generateReference(),
      reason: 'Licence is recorded as inactive or suspended.',
    }
  }

  return {
    approved: true,
    status: 'approved',
    reference: generateReference(),
  }
}
