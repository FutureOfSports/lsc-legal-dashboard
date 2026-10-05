/** Shared server-rendered labels and safe source links for the FSP review workspace. */
import type { ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'

export function displayState(value: string) {
  return value.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
}

export function displayDate(value: Date | string | null | undefined) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toISOString().slice(0, 10)
}

export function StateLabel({ value }: { value: string }) {
  const tone = value === 'VERIFIED' || value === 'DELIVERED' ? 'text-positive'
    : value === 'GAP' || value === 'CRITICAL' || value === 'FAILED' ? 'text-negative'
      : value === 'NEEDS_FACTS' || value === 'HIGH' || value === 'LEGAL_REVIEW' ? 'text-warning'
        : 'text-muted-foreground'
  return <span className={`text-xs font-medium ${tone}`}>{displayState(value)}</span>
}

export function EvidenceLink({ url, children }: { url: string | null | undefined; children: ReactNode }) {
  let safe = false
  try {
    const parsed = new URL(url ?? '')
    safe = parsed.protocol === 'https:' && !parsed.username && !parsed.password
  } catch { /* Non-web references remain readable without becoming active links. */ }
  return safe ? <a href={url!} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-start gap-1 break-words text-primary underline-offset-4 hover:underline"><span className="min-w-0 break-words">{children}</span><ExternalLink className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" /></a>
    : <span className="break-words">{children}{url?.startsWith('urn:') && <span className="mt-1 block break-all font-mono text-xs text-muted-foreground">{url}</span>}</span>
}

export function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm leading-relaxed">{children}</dd></div>
}
