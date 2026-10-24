/** Firestore durably captures requested work before its HTTP acknowledgement. No task is automatically replayed. */
import { randomUUID } from 'node:crypto'
import { after } from 'next/server'
import { legalFirestore } from './firestore/client'
import { PayloadStore } from './firestore/payloads'
import type { AgentId } from './agents/types'
import type { LegalTrackerEventType, LegalTrackerMessage } from './legal-tracker'
import type { MndaSendParams } from './mnda'

export interface SlashContext {
  command: string; text: string; slackUserId: string; channelId: string;
  triggerId: string; responseUrl: string; requestKey: string;
}
export type LegalTask =
  | { kind: 'agent'; agentId: AgentId; input: Record<string, unknown> }
  | { kind: 'upload-analysis'; documentId: string; versionId?: string; fileUrl: string; name: string; mimeType: string }
  | { kind: 'lifecycle'; documentId: string; agentId?: AgentId; emitFinance: boolean }
  | { kind: 'tracker'; event: LegalTrackerEventType; message: LegalTrackerMessage; ref: { entityType: string; entityId: string } }
  | { kind: 'slack-command'; context: SlashContext }
  | { kind: 'slack-mnda'; params: MndaSendParams; slackUserId: string; channelId: string; claimId: string }
  | { kind: 'ciso-delivery' }

export async function scheduleLegalTask(task: LegalTask, legacy: () => Promise<void>, actorId?: string) {
  if (process.env.LEGAL_DATA_BACKEND !== 'firestore') { after(legacy); return }
  const bucket = process.env.LEGAL_FIRESTORE_PAYLOAD_BUCKET
  if (!bucket) throw new Error('Legal background payload storage is required')
  const db = legalFirestore()
  const id = randomUUID()
  const packed = await new PayloadStore(bucket).pack({ task: JSON.parse(JSON.stringify(task)), actorId: actorId ?? null,
    status: 'QUEUED', createdAt: new Date().toISOString(), leaseToken: null, error: null })
  await db.collection('LegalBackgroundTask').doc(id).create(packed)
}
