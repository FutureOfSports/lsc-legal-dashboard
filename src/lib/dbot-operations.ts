/** D-bot uses application services; legal decisions and final approvals stay with people. */
import { buildAppUrl } from '@/lib/app-url'
import { executeSlackOperation, SLACK_OPERATION_INVENTORY, SLACK_HELP, formHelp } from '@/lib/slack-operations'
import { agreementLookup, legalStatusSummary, signaturesInFlight } from '@/lib/slack-legal-queries'
import { requireGlobalDocumentAccess } from '@/lib/document-access'
import { getFspComplianceDashboard } from '@/lib/fsp-compliance/service'
import { listCisoSyncJobs } from '@/lib/ciso-assistant/sync-service'
import type { SessionPayload } from '@/lib/session'

export const DBOT_COMMANDS = [
  'help', 'coverage', 'status', 'find', 'signatures', 'drive', 'request', 'access',
  'entities', 'reviews', 'schedules', 'review-complete', 'review-change', 'kyc-status',
  'matters', 'matter-status', 'templates', 'template', 'template-save', 'artifacts',
  'generate', 'refine', 'job', 'cancel', 'export', 'exports', 'entity-save', 'filing-save',
  'ownership-save', 'kyc-link', 'schedule-create', 'schedule-save', 'schedule-active',
  'dependencies', 'policy-create', 'name-propose', 'artifact-lineage', 'amount',
  'compliance', 'compliance-facts', 'ciso-receipts', 'platform',
] as const

export const DBOT_READ_COMMANDS = new Set<string>([
  'help', 'coverage', 'status', 'find', 'signatures', 'drive', 'access', 'entities',
  'reviews', 'schedules', 'matters', 'templates', 'template', 'artifacts', 'job',
  'exports', 'compliance', 'compliance-facts', 'ciso-receipts', 'platform',
])

const modules = [
  ['Dashboard', '/legal'], ['Agreements', '/legal/agreements'], ['Documents', '/legal/documents'],
  ['Document review', '/legal/documents/review'], ['Repositories', '/legal/repositories'], ['Templates', '/legal/templates'], ['Contract generation', '/legal/generate'],
  ['Signatures and MNDA sending', '/legal/signatures'], ['Redlines', '/legal/redlines'], ['Expirations', '/legal/expirations'],
  ['Entities', '/legal/compliance/entities'], ['KYC', '/legal/compliance/entities/kyc'], ['Compliance', '/legal/compliance'],
  ['FSP compliance and CISO', '/legal/compliance/fsp'], ['Review schedules', '/legal/compliance/reviews'],
  ['Registered offices', '/legal/compliance/registered-offices'], ['Data protection', '/legal/compliance/data-protection'],
  ['Compliance emails', '/legal/compliance/emails'],
  ['Policies', '/legal/policies'], ['Litigation', '/legal/litigation'], ['Arbitration', '/legal/arbitration'],
  ['Backups', '/legal/backups'], ['File naming', '/legal/file-naming'], ['Currencies', '/legal/currencies'],
  ['Access decisions', '/legal/access'], ['Finance sync', '/legal/finance-sync'], ['Payment cycles', '/legal/payment-cycles'],
  ['ESOP', '/legal/esop'], ['Issues', '/legal/issues'], ['Tracker', '/legal/tracker'], ['Clickwrap', '/legal/clickwrap'],
  ['Subsidies', '/legal/subsidies'], ['Email intelligence', '/legal/email-intelligence'], ['Audit reports', '/legal/audit-reports'],
  ['Operations monitor', '/legal/ops-monitor'], ['Mailbox and account administration', '/legal/admin-accounts'],
  ['Table configuration', '/legal/table-config'], ['Agent architecture', '/legal/agent-architecture'],
] as const

export function dbotCatalog() {
  return { version: 1, commands: DBOT_COMMANDS, operations: SLACK_OPERATION_INVENTORY,
    syntax: SLACK_HELP, commandFields: Object.fromEntries(Object.entries(formHelp).filter(([command]) => DBOT_COMMANDS.some(value => value === command))),
    modules: modules.map(([name, path]) => ({ name, url: buildAppUrl(path) })),
    humanApproval: ['Applicability decisions and verified controls', 'Generated document approval and save',
      'Access grants and revocation', 'Final naming approval, finalization and publication', 'Signature sending', 'Mailbox administration'],
    notes: 'Commands preserve dashboard permissions. External integration readiness is reported by the underlying service. No recurring compliance review is enabled.' }
}

export async function executeDbotOperation(actor: SessionPayload, command: string, text: string, requestKey: string): Promise<string> {
  if (!DBOT_COMMANDS.some(value => value === command)) throw new Error('Unsupported D-bot command')
  if (command === 'platform') {
    // The directory contains no legal records; every destination enforces its own session.
    return JSON.stringify(dbotCatalog())
  }
  if (command === 'status') return JSON.stringify(await legalStatusSummary(actor))
  if (command === 'find') return JSON.stringify(await agreementLookup(actor, text.trim()))
  if (command === 'signatures') return JSON.stringify(await signaturesInFlight(actor))
  if (command === 'compliance' || command === 'compliance-facts') {
    const workspace = await getFspComplianceDashboard(actor)
    if (!workspace.available) return 'FSP compliance feed is unavailable.'
    if (command === 'compliance-facts') return JSON.stringify({ snapshotId: workspace.snapshotId, facts: workspace.facts, sources: workspace.sources })
    const selected = text.trim()
    return JSON.stringify({ revision: workspace.revision, assessmentId: workspace.assessmentId, counts: workspace.counts,
      findings: workspace.findings.filter(item => !selected || item.rule.id === selected),
      url: buildAppUrl('/legal/compliance/fsp'), notice: 'Source signals are not legal sign-off. A person must review applicability and control evidence.' })
  }
  if (command === 'ciso-receipts') {
    await requireGlobalDocumentAccess(actor)
    return JSON.stringify(await listCisoSyncJobs(actor))
  }
  return executeSlackOperation(actor, command, text, requestKey)
}
