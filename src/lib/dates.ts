// Date formatting helpers. ADR-007: ISO in monospace contexts, DMY in body
// prose. Never mixed within one context.

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

// YYYY-MM-DD. Document strips, marginalia, feed metadata, code.
export function formatIso(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// "13 May 2026" — DMY, AU convention. Body prose only.
export function formatProse(date: Date): string {
  const d = date.getUTCDate()
  const m = MONTHS[date.getUTCMonth()] ?? ''
  const y = date.getUTCFullYear()
  return `${d} ${m} ${y}`
}

export function parseDate(input: string | Date | null | undefined): Date | null {
  if (input == null) return null
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input
  const d = new Date(input)
  return isNaN(d.getTime()) ? null : d
}
