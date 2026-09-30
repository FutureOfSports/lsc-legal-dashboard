/**
 * The app's own public origin, for links inside outbound notifications.
 *
 * Server-generated links use the same runtime origin as magic-link login.
 * Legacy Vercel settings remain fallback inputs for older deployments.
 */
const FALLBACK_ORIGIN = "https://lsc-legal-dashboard.vercel.app"

export function getAppBaseUrl(): string {
  const configured =
    process.env.AUTH_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()

  if (!configured) return FALLBACK_ORIGIN

  const withScheme = /^https?:\/\//i.test(configured) ? configured : `https://${configured}`
  return withScheme.replace(/\/+$/, "")
}

export function buildAppUrl(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`
  return `${getAppBaseUrl()}${suffix}`
}
