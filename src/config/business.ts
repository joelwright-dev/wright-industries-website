// Registered business naming. Two states (ADR-008):
//
//   Pre-registration  → footer reads "WRIGHT INDUSTRIES · BRISBANE · ABN XX XXX XXX XXX"
//   Post-registration → footer reads "J. WRIGHT INDUSTRIES · BRISBANE · ABN <real>"
//
// Flip `isRegistered` and substitute the real `abn` once ASIC processing
// completes. No other changes required.

export const BUSINESS = {
  legalName: 'WRIGHT INDUSTRIES',
  isRegistered: false,
  abn: 'XX XXX XXX XXX',
  location: 'BRISBANE',
} as const

export function footerBusinessName(): string {
  return BUSINESS.isRegistered ? `J. ${BUSINESS.legalName}` : BUSINESS.legalName
}
