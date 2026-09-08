const SALESFORCE_EMAIL_RE = /^[^@\s]+@salesforce\.com$/i
const APPROVED_GMAIL_TEST_ADDRESS = 'carlosortegatoro@gmail.com'

export const ALLOWED_EMAIL_ERROR =
  'Email must be a @salesforce.com address or the approved Gmail test address'

export function isAllowedEmailAddress(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return SALESFORCE_EMAIL_RE.test(normalized) || normalized === APPROVED_GMAIL_TEST_ADDRESS
}
