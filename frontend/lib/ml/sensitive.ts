import { emailPattern, phonePattern, offPlatformKeywords } from '../policySignals'

export type SensitiveRiskAssessment = {
  score: number
  indicators: string[]
}

type Indicator = {
  weight: number
  reason: string
}

type KeywordSignal = {
  pattern: RegExp
  reason: string
}

const logistic = (value: number): number => {
  return 1 / (1 + Math.exp(-value))
}

const normalise = (value: number): number => {
  return Math.round(value * 1000) / 1000
}

const keywordMatches = (text: string, patterns: KeywordSignal[]): Indicator | null => {
  for (const signal of patterns) {
    if (signal.pattern.test(text)) {
      return { weight: 0.85, reason: signal.reason }
    }
  }
  return null
}

export const assessSensitiveContent = (message: string): SensitiveRiskAssessment => {
  const text = message.trim()
  if (!text) {
    return { score: 0, indicators: [] }
  }

  const lower = text.toLowerCase()
  let activation = -2.1
  const indicators: string[] = []

  if (emailPattern.test(text)) {
    activation += 1.25
    indicators.push('Email address pattern detected')
  }

  if (phonePattern.test(text)) {
    activation += 1.1
    indicators.push('Phone number pattern detected')
  }

  if (offPlatformKeywords.test(lower)) {
    activation += 0.9
    indicators.push('Off-platform redirection language detected')
  }

  const digitMatches = text.match(/[0-9]/g)
  if (digitMatches && digitMatches.length >= 10) {
    activation += 0.75
    indicators.push('High concentration of digits could encode account or ID numbers')
  }

  const bankIndicator = keywordMatches(lower, [
    { pattern: /bsb\b/i, reason: 'BSB reference present' },
    { pattern: /account\s+number/i, reason: 'Account number keyword present' },
    { pattern: /bank\s+details/i, reason: 'Bank details keyword detected' },
    { pattern: /direct\s+deposit/i, reason: 'Direct deposit keyword detected' },
    { pattern: /swift\b/i, reason: 'SWIFT code keyword detected' },
  ])
  if (bankIndicator) {
    activation += bankIndicator.weight
    indicators.push(bankIndicator.reason)
  }

  const idIndicator = keywordMatches(lower, [
    { pattern: /passport/i, reason: 'Passport keyword detected' },
    { pattern: /driver'?s\s+licence/i, reason: "Driver's licence keyword detected" },
    { pattern: /medicare/i, reason: 'Medicare keyword detected' },
    { pattern: /tax\s+file\s+number/i, reason: 'Tax File Number keyword detected' },
    { pattern: /tfn\b/i, reason: 'TFN keyword detected' },
  ])
  if (idIndicator) {
    activation += idIndicator.weight
    indicators.push(idIndicator.reason)
  }

  const urlMatches = text.match(/https?:\/\//gi)
  if (urlMatches) {
    activation += 0.45
    indicators.push('External URL detected')
  }

  const score = logistic(activation)
  return {
    score: normalise(score),
    indicators,
  }
}

export const SENSITIVE_RISK_THRESHOLD = 0.7
