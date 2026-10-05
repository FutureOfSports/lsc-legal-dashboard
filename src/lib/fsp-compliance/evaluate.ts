/** Three-valued logic never converts missing or expired evidence into a false exclusion. */
import type { ComplianceFeed, RuleEvaluation, Trigger, Truth } from './types'
import { referencedFacts, today } from './validation'

export function evaluateTrigger(trigger: Trigger, facts: ReadonlyMap<string, Truth>): Truth {
  if ('fact' in trigger) return facts.get(trigger.fact) ?? 'UNKNOWN'
  if ('not' in trigger) {
    const result = evaluateTrigger(trigger.not, facts)
    return result === 'UNKNOWN' ? 'UNKNOWN' : result === 'TRUE' ? 'FALSE' : 'TRUE'
  }
  const values = ('all' in trigger ? trigger.all : trigger.any).map(item => evaluateTrigger(item, facts))
  if ('all' in trigger) return values.includes('FALSE') ? 'FALSE' : values.includes('UNKNOWN') ? 'UNKNOWN' : 'TRUE'
  return values.includes('TRUE') ? 'TRUE' : values.includes('UNKNOWN') ? 'UNKNOWN' : 'FALSE'
}
export function evaluateFeed(feed: ComplianceFeed, now = new Date()): RuleEvaluation[] {
  const date = today(now)
  const facts = new Map(feed.facts.map(fact => [fact.key, fact.reviewOn <= date ? 'UNKNOWN' as const : fact.value]))
  return feed.rules.map(rule => {
    const factKeys = referencedFacts(rule.trigger)
    const staleFactKeys = feed.facts.filter(fact => factKeys.includes(fact.key) && fact.reviewOn <= date).map(fact => fact.key)
    const missingFactKeys = factKeys.filter(key => !facts.has(key) || facts.get(key) === 'UNKNOWN')
    const timing = !rule.effectiveFrom ? 'UNKNOWN' : rule.effectiveFrom > date ? 'FUTURE'
      : rule.effectiveTo && rule.effectiveTo < date ? 'EXPIRED' : 'CURRENT'
    const truth = evaluateTrigger(rule.trigger, facts)
    return { ruleId: rule.id, truth, timing, factKeys, missingFactKeys, staleFactKeys,
      proposedStatus: truth === 'UNKNOWN' || timing === 'UNKNOWN' ? 'NEEDS_FACTS' : 'LEGAL_REVIEW' }
  })
}
