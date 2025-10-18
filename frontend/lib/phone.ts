export const normalizePhoneNumber = (raw: string): string | null => {
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/[^0-9]/g, '')
  if (digits.length < 8 || digits.length > 15) {
    return null
  }
  if (hasPlus) {
    return `+${digits}`
  }
  if (digits.startsWith('0')) {
    return `+61${digits.slice(1)}`
  }
  return `+${digits}`
}
