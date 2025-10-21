import { assessSensitiveContent, SENSITIVE_RISK_THRESHOLD } from '../sensitive'

describe('assessSensitiveContent', () => {
  it('returns a zero score for empty or whitespace-only messages', () => {
    expect(assessSensitiveContent('')).toEqual({ score: 0, indicators: [] })
    expect(assessSensitiveContent('   ')).toEqual({ score: 0, indicators: [] })
  })

  it('surfaces multiple indicators for composite sensitive signals', () => {
    const message =
      'Email me at client@example.com or call 0400123456 so we can move this to WhatsApp quickly.'
    const result = assessSensitiveContent(message)

    expect(result.score).toBeGreaterThanOrEqual(SENSITIVE_RISK_THRESHOLD)
    expect(result.indicators).toEqual(
      expect.arrayContaining([
        'Email address pattern detected',
        'Phone number pattern detected',
        'Off-platform redirection language detected',
      ])
    )
  })

  it('identifies encoded banking instructions via digits and keywords', () => {
    const message = 'Here are the BSB 123456 and account number 9876543210 for the transfer.'
    const result = assessSensitiveContent(message)

    expect(result.score).toBeCloseTo(0.646, 3)
    expect(result.indicators).toEqual(
      expect.arrayContaining([
        'High concentration of digits could encode account or ID numbers',
        'BSB reference present',
      ])
    )
  })
})
