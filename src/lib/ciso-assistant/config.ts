/** Server-owned connection identity. Changing origin/domain never retargets queued writes. */
import 'server-only'
import { createHash } from 'node:crypto'
import { createCisoAssistantClient, CisoClientError } from './client'
import type { CisoAssistantClient } from './contracts'

export function cisoInstanceKey(client: Pick<CisoAssistantClient, 'baseUrl' | 'domainId'>): string {
  return createHash('sha256').update(`${client.baseUrl}\n${client.domainId}`).digest('hex')
}

export function configuredCisoClient(): CisoAssistantClient {
  if (process.env.CISO_ASSISTANT_ENABLED !== '1') throw new Error('CISO integration is disabled.')
  const baseUrl = process.env.CISO_ASSISTANT_URL
  const token = process.env.CISO_ASSISTANT_TOKEN
  const domainId = process.env.CISO_ASSISTANT_DOMAIN_ID
  if (!baseUrl || !token || !domainId) throw new CisoClientError('configuration')
  return createCisoAssistantClient({ baseUrl, token, domainId,
    frameworkIds: process.env.CISO_ASSISTANT_FRAMEWORK_IDS?.split(',').map(id => id.trim()).filter(Boolean),
    allowLoopbackHttp: process.env.CISO_ASSISTANT_ALLOW_LOOPBACK === '1' })
}
