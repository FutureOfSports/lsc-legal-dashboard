/** Validate imported source snapshots and bounded human edits before persistence. */
import type { ComplianceFeed, ComplianceFact, ComplianceRule, ComplianceSource, Trigger, Truth } from './types'

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object.')
  return value as Record<string, unknown>
}
export function text(value: unknown, name: string, maximum = 5000): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) throw new Error(`Invalid ${name}.`)
  return value.trim()
}
export function choice<const T extends readonly string[]>(value: unknown, choices: T, name: string): T[number] {
  if (typeof value !== 'string' || !choices.includes(value)) throw new Error(`Invalid ${name}.`)
  return value as T[number]
}
export function day(value: unknown, name: string): string {
  const result = text(value, name, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(`${result}T00:00:00Z`))
    || new Date(`${result}T00:00:00Z`).toISOString().slice(0, 10) !== result) throw new Error(`Invalid ${name}.`)
  return result
}
export function today(now = new Date()) { return now.toISOString().slice(0, 10) }
function list(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error('Invalid list.')
  return value
}
function strings(value: unknown, maximum = 100) { return list(value, maximum).map(item => text(item, 'reference', 1000)) }
function identifier(value: unknown) {
  const result = text(value, 'identifier', 160)
  if (!/^[a-zA-Z0-9_.:-]+$/.test(result)) throw new Error('Invalid identifier.')
  return result
}
function url(value: unknown) {
  const result = text(value, 'source URL', 2000)
  const parsed = new URL(result)
  if (!['https:', 'urn:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Sources require HTTPS or an explicit URN.')
  return result
}
export function parseTrigger(value: unknown, depth = 0): Trigger {
  if (depth > 8) throw new Error('Rule expression is too deep.')
  const input = record(value)
  if (Object.keys(input).length !== 1) throw new Error('Rule needs one expression.')
  if ('fact' in input) return { fact: identifier(input.fact) }
  if ('not' in input) return { not: parseTrigger(input.not, depth + 1) }
  const operator = 'all' in input ? 'all' : 'any' in input ? 'any' : null
  if (!operator) throw new Error('Unknown rule expression.')
  const children = list(input[operator], 100).map(item => parseTrigger(item, depth + 1))
  if (!children.length) throw new Error('Empty rules are not permitted.')
  return operator === 'all' ? { all: children } : { any: children }
}
export function referencedFacts(trigger: Trigger): string[] {
  if ('fact' in trigger) return [trigger.fact]
  if ('not' in trigger) return referencedFacts(trigger.not)
  return [...new Set(('all' in trigger ? trigger.all : trigger.any).flatMap(referencedFacts))]
}
export function parseFact(value: unknown): ComplianceFact {
  const fact = record(value)
  const result: ComplianceFact = {
    key: identifier(fact.key), label: text(fact.label, 'fact label', 250), value: choice(fact.value, ['TRUE', 'FALSE', 'UNKNOWN'] as const, 'fact value'),
    certainty: choice(fact.certainty, ['SOURCE_SIGNAL', 'USER_CONFIRMED', 'LIVE_VERIFIED', 'UNKNOWN'] as const, 'fact certainty'),
    detail: text(fact.detail, 'fact detail'), sourceIds: strings(fact.sourceIds), reviewOn: day(fact.reviewOn, 'fact review date'),
  }
  if (result.value !== 'UNKNOWN' && (result.certainty === 'UNKNOWN' || !result.sourceIds.length)) throw new Error('Known facts require sourced evidence and its certainty.')
  return result
}
export function parseFeed(value: unknown): ComplianceFeed {
  const input = record(value)
  const sources: ComplianceSource[] = list(input.sources, 500).map(item => {
    const source = record(item)
    return { id: identifier(source.id), title: text(source.title, 'source title', 500), url: url(source.url), checkedAt: day(source.checkedAt, 'source checked date'),
      kind: choice(source.kind, ['LAW', 'REGULATOR', 'REPOSITORY', 'PUBLIC_POLICY', 'BUSINESS_CONFIRMATION'] as const, 'source kind'),
      ...(source.note ? { note: text(source.note, 'source note') } : {}) }
  })
  const facts = list(input.facts, 500).map(parseFact)
  const rules: ComplianceRule[] = list(input.rules, 500).map(item => {
    const rule = record(item)
    return { id: identifier(rule.id), title: text(rule.title, 'rule title', 250), category: text(rule.category, 'category', 100),
      priority: choice(rule.priority, ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const, 'priority'),
      basis: choice(rule.basis, ['LAW', 'CONTRACT', 'PROCESSOR', 'ASSURANCE'] as const, 'basis'), jurisdiction: text(rule.jurisdiction, 'jurisdiction', 200),
      summary: text(rule.summary, 'rule summary'), sourceIds: strings(rule.sourceIds), trigger: parseTrigger(rule.trigger),
      effectiveFrom: rule.effectiveFrom === null ? null : day(rule.effectiveFrom, 'effective date'),
      effectiveTo: rule.effectiveTo === null ? null : day(rule.effectiveTo, 'expiry date'), actions: strings(rule.actions), reviewOn: day(rule.reviewOn, 'rule review date') }
  })
  for (const values of [sources.map(source => source.id), facts.map(fact => fact.key), rules.map(rule => rule.id)]) {
    if (new Set(values).size !== values.length) throw new Error('Duplicate source, fact or rule identifier.')
  }
  const sourceIds = new Set(sources.map(source => source.id)), factKeys = new Set(facts.map(fact => fact.key))
  for (const item of [...facts, ...rules]) if (item.sourceIds.some(id => !sourceIds.has(id))) throw new Error('Unknown source reference.')
  for (const rule of rules) {
    if (!rule.sourceIds.length || referencedFacts(rule.trigger).some(key => !factKeys.has(key))) throw new Error('Rules require valid sources and facts.')
    if (rule.effectiveFrom && rule.effectiveTo && rule.effectiveTo < rule.effectiveFrom) throw new Error('Rule expiry precedes its effective date.')
  }
  if (!rules.length || !facts.length || !sources.length) throw new Error('A feed requires sources, facts and rules.')
  return { id: identifier(input.id), title: text(input.title, 'feed title', 250), checkedAt: day(input.checkedAt, 'feed checked date'), sources, facts, rules }
}
export function truth(value: unknown): Truth { return choice(value, ['TRUE', 'FALSE', 'UNKNOWN'] as const, 'truth value') }
