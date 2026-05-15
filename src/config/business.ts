// Registered business naming. Two states (ADR-008):
//
//   Pre-registration  → footer reads "WRIGHT INDUSTRIES · BRISBANE · ABN XX XXX XXX XXX"
//   Post-registration → footer reads "J WRIGHT INDUSTRIES · BRISBANE · ABN <real>"
//
// The registered name is "J WRIGHT INDUSTRIES" with no period after the J —
// that is the form ASIC recorded and the form that must appear anywhere the
// legal business name is shown.

export const BUSINESS = {
  legalName: 'WRIGHT INDUSTRIES',
  isRegistered: true,
  abn: '15 724 733 509',
  location: 'BRISBANE',
} as const

/** Email routing for the contact form. Sender addresses must live on a
 * domain that's verified in Resend (DKIM/SPF/DMARC). The inbox does not. */
export const BUSINESS_EMAIL = {
  inbox: 'joel@wrightindustries.com.au',
  notificationFrom: 'Wright Industries <noreply@wrightindustries.com.au>',
  autoReplyFrom: 'Wright Industries <noreply@wrightindustries.com.au>',
} as const

export function footerBusinessName(): string {
  return BUSINESS.isRegistered ? `J ${BUSINESS.legalName}` : BUSINESS.legalName
}
