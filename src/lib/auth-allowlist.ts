import { GLOBAL_DOCUMENT_EMAILS } from './document-principals'

export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function getAllowedLoginEmails(): string[] {
  const configured = process.env.AUTH_ALLOWED_EMAILS
  const source = configured?.trim() ? configured.split(",") : GLOBAL_DOCUMENT_EMAILS

  return Array.from(
    new Set(
      source
        .map((email) => normalizeLoginEmail(email))
        .filter(email => GLOBAL_DOCUMENT_EMAILS.some(allowed => allowed === email))
    )
  )
}

export function isEmailAllowedToLogin(email: string): boolean {
  return getAllowedLoginEmails().includes(normalizeLoginEmail(email))
}
