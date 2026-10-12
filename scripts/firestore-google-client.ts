/** Local operator tools use the selected gcloud account in memory, never a credential export. */
import { execFileSync } from 'node:child_process'
import { Firestore } from '@google-cloud/firestore'
import { OAuth2Client } from 'google-auth-library'
import { Storage, type StorageOptions } from '@google-cloud/storage'

function operatorAuth() {
  const projectId = process.env.LEGAL_FIRESTORE_PROJECT
  const account = process.env.LEGAL_MIGRATION_ACCOUNT
  if (!projectId || !account) throw new Error('Explicit Legal migration project and account are required')
  const authClient = new OAuth2Client()
  authClient.setCredentials({ access_token: execFileSync('gcloud', ['auth', 'print-access-token', `--account=${account}`, `--project=${projectId}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() })
  return { projectId, authClient }
}
export function operatorFirestore(databaseId: string) {
  if (!databaseId.startsWith('legal-os')) throw new Error('A dedicated Legal database is required')
  return new Firestore({ ...operatorAuth(), databaseId })
}
export function operatorStorage() {
  const { projectId, authClient } = operatorAuth()
  // Storage and the app resolve different GoogleAuth majors with nominal protected fields.
  // Both expose the same supported OAuth2 AuthClient protocol; payload tests exercise it live.
  return new Storage({ projectId, authClient: authClient as unknown as StorageOptions['authClient'] })
}
