/** Explicit runtime acceptance. Sends only synthetic text, never production documents or approvals. */
import { callProxyAI, checkProxyAIReady, getProxyAIConfigIdentity } from '../src/lib/ai-proxy'
import { hashDraft } from '../src/lib/contract-generation-protocol'

async function main() {
  if (process.env.LEGAL_PROXY_LIVE_PROOF !== 'synthetic-only') throw new Error('Explicit synthetic acceptance is required')
  await checkProxyAIReady()
  const draft = await callProxyAI({
    system: 'You are testing a legal platform connection. Return only the requested JSON object. All entities and text are fictional. This is not a contract or legal advice.',
    user: 'Return {"draft":"SYNTHETIC TEST: Alpha and Beta each keep the other party\u0027s marked test material confidential. This sample creates no legal obligation."}.',
    expectJson: true,
  })
  const parsed: unknown = JSON.parse(draft.text)
  if (!parsed || typeof parsed !== 'object' || !('draft' in parsed) || typeof parsed.draft !== 'string'
    || !parsed.draft.startsWith('SYNTHETIC TEST:')) throw new Error('Synthetic draft was invalid')
  const draftHash = hashDraft(parsed.draft)
  const reviews = await Promise.all(['mutuality', 'cross-references'].map(async angle => {
    const response = await callProxyAI({
      system: 'Review the supplied synthetic test text only. Return a JSON object with draftHash exactly as supplied, angle exactly as supplied, and observation as one sentence. Do not claim compliance or legal approval.',
      user: JSON.stringify({ draft: parsed.draft, draftHash, angle }), expectJson: true,
    })
    const output: unknown = JSON.parse(response.text)
    if (!output || typeof output !== 'object' || !('draftHash' in output) || output.draftHash !== draftHash
      || !('angle' in output) || output.angle !== angle || !('observation' in output)
      || typeof output.observation !== 'string' || !output.observation.trim()) throw new Error('Synthetic review was invalid')
    return { model: response.model, responseId: response.responseId, angle }
  }))
  const ids = [draft.responseId, ...reviews.map(review => review.responseId)]
  if (new Set(ids).size !== 3) throw new Error('Independent response identifiers were required')
  console.log(JSON.stringify({ check: 'CLIPROXY_SYNTHETIC_RUNTIME', passed: true,
    model: draft.model, responseIds: ids, draftHash, configIdentity: getProxyAIConfigIdentity(),
    productionDataSent: false, legalApprovalCreated: false }))
}

main().catch(() => { console.error('Synthetic proxy runtime acceptance failed. No production data or approval was used.'); process.exitCode = 1 })
