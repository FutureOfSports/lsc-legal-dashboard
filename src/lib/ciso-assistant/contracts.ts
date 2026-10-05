/** Restricted Community API contracts. Applicability decisions remain in Legal OS. */
export type CisoErrorCode =
  | "configuration" | "invalid_input" | "authentication" | "forbidden"
  | "not_found" | "rate_limit" | "upstream" | "timeout" | "transport"
  | "invalid_response" | "scope_mismatch" | "ambiguous_match" | "pagination_limit"

export interface CisoClientConfig {
  /** Server-owned CISO origin or /api/ base, never supplied by an app requester. */
  baseUrl: string
  token: string
  domainId: string
  /** Explicit read-only catalog IDs. Imported frameworks can belong to the global folder. */
  frameworkIds?: readonly string[]
  /** Server-owned Cloud Run identity, separate from the Community PAT. */
  getIdentityToken?: () => Promise<string>
  /** Synthetic integration tests only; rejected when NODE_ENV=production. */
  allowLoopbackHttp?: boolean
  timeoutMs?: number
  maxPages?: number
  maxResponseBytes?: number
}

export const CISO_CONTROL_STATUSES = [
  "to_do", "in_progress", "on_hold", "active", "degraded", "deprecated", "--",
] as const
export type CisoControlStatus = typeof CISO_CONTROL_STATUSES[number]
export type CisoEvidenceStatus = "draft" | "missing" | "in_review" | "approved" | "rejected" | "expired"

export interface CisoControl {
  id: string
  domainId: string
  refId: string | null
  name: string
  description: string
  status: CisoControlStatus
}

export interface CisoControlInput {
  refId: string
  name: string
  description: string
  /** Omitting preserves status on update; a new control starts at to_do. */
  status?: CisoControlStatus
}

export interface CisoEvidence {
  id: string
  domainId: string
  marker: string | null
  name: string
  description: string
  link: string | null
  status: CisoEvidenceStatus
  controlIds: string[]
}

export interface CisoEvidenceInput {
  marker: string
  name: string
  description: string
  /** Optional immutable reference only, not an attachment or download instruction. */
  link?: string
  /** Every linked control is independently checked against the configured domain. */
  controlIds?: string[]
}

export interface CisoFramework {
  id: string
  /** Actual catalog folder, which can differ from the configured FSP domain. */
  domainId: string
  name: string
  description: string
  urn: string
}

export interface CisoAssistantClient {
  readonly baseUrl: string
  readonly domainId: string
  getControl(id: string): Promise<CisoControl>
  findControlByRefId(refId: string): Promise<CisoControl | null>
  createControl(input: CisoControlInput): Promise<CisoControl>
  updateControl(id: string, input: CisoControlInput): Promise<CisoControl>
  getEvidence(id: string): Promise<CisoEvidence>
  findEvidenceByMarker(marker: string): Promise<CisoEvidence | null>
  createEvidence(input: CisoEvidenceInput): Promise<CisoEvidence>
  updateEvidence(id: string, input: CisoEvidenceInput): Promise<CisoEvidence>
  getFramework(id: string): Promise<CisoFramework>
}
