import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { callProxyAI, CLIPROXY_MODEL, ProxyAIError } from '@/lib/ai-proxy'
import type { AgentId, AgentMessagePayload, AgentResult, AgentMessagePriority } from './types'

const DEFAULT_PROVIDER = 'cliproxyapi'

export type AICallOptions = {
  system: string
  user: string
  model?: 'haiku' | 'sonnet'
  maxTokens?: number
  expectJson?: boolean
}

export abstract class BaseAgent {
  abstract id: AgentId
  abstract name: string
  abstract description: string

  async sendMessage(
    to: AgentId,
    intent: string,
    payload: unknown,
    priority: AgentMessagePriority = 'normal',
    requiresResponse = false
  ): Promise<string> {
    const msg = await prisma.agentMessage.create({
      data: {
        from_agent: this.id,
        to_agent: to,
        intent,
        payload: payload as any,
        priority: priority.toUpperCase() as any,
        requires_response: requiresResponse,
      },
    })
    await this.log(`sent_message`, { to, intent, messageId: msg.id })
    return msg.id
  }

  async receiveMessage(message: AgentMessagePayload): Promise<AgentResult> {
    await this.log('unsupported_message_intent', { from: message.from, intent: message.intent })
    return {
      success: false,
      error: `Agent ${this.id} does not support message intent ${message.intent}. Use runAgent() triggers.`,
    }
  }

  async log(action: string, details?: unknown): Promise<void> {
    await prisma.agentActivityLog.create({
      data: {
        agent_id: this.id,
        agent_name: this.name,
        action,
        details: details as any,
      },
    })
  }

  /**
   * Proxy calls never fall back or change model. Legacy provider routing requires
   * an explicit legacy AI_PROVIDER setting.
   */
  async callAI(opts: AICallOptions | string, legacyUser?: string): Promise<string> {
    // Backwards-compat: old two-arg form `callAI(system, user)`
    const normalized: AICallOptions =
      typeof opts === 'string'
        ? { system: opts, user: legacyUser ?? '' }
        : opts

    const configured = (process.env.AI_PROVIDER ?? DEFAULT_PROVIDER).trim().toLowerCase()
    if (configured === 'cliproxyapi') {
      const started = Date.now()
      try {
        const result = await callProxyAI(normalized)
        await this.log('ai_call_succeeded', { provider: configured, model: result.model,
          responseId: result.responseId, durationMs: Date.now() - started, fallbackUsed: false })
        return result.text
      } catch (error) {
        await this.log('ai_provider_failed', { provider: configured, model: CLIPROXY_MODEL,
          durationMs: Date.now() - started, category: error instanceof ProxyAIError ? error.code : 'provider_error' })
        throw error instanceof ProxyAIError ? error : new ProxyAIError('upstream')
      }
    }
    if (configured !== 'gemini' && configured !== 'anthropic') throw new ProxyAIError('configuration')
    const trimmed = normalized.user.slice(0, 8000)
    const providers = getProviderOrder(configured)
    const failures: { provider: string; category: string; error: string }[] = []

    for (const provider of providers) {
      const started = Date.now()
      const modelName = getModelName(provider, normalized.model)
      try {
        const text =
          provider === 'gemini'
            ? await callGemini(modelName, normalized.system, trimmed)
            : await callAnthropic(modelName, normalized, trimmed)

        await this.log('ai_call_succeeded', {
          provider,
          model: modelName,
          durationMs: Date.now() - started,
          fallbackUsed: provider !== providers[0],
        })
        return text
      } catch (error) {
        const category = categorizeAiError(error)
        const message = error instanceof Error ? error.message : String(error)
        failures.push({ provider, category, error: message })
        await this.log('ai_provider_failed', {
          provider,
          model: modelName,
          durationMs: Date.now() - started,
          category,
          error: message.slice(0, 500),
        })

        if (!isFallbackEligible(category) || provider === providers.at(-1)) {
          break
        }
      }
    }

    throw new Error(
      `AI call failed across configured providers: ${failures
        .map((failure) => `${failure.provider}:${failure.category}:${failure.error}`)
        .join(' | ')}`
    )
  }

  abstract run(input?: unknown): Promise<AgentResult>
}

function getProviderOrder(primary: 'gemini' | 'anthropic'): ('gemini' | 'anthropic')[] {
  const order: ('gemini' | 'anthropic')[] = []

  if (primary === 'gemini' && process.env.GEMINI_API_KEY) order.push('gemini')
  if (primary === 'anthropic' && process.env.ANTHROPIC_API_KEY) order.push('anthropic')
  if (!order.includes('gemini') && process.env.GEMINI_API_KEY) order.push('gemini')
  if (!order.includes('anthropic') && process.env.ANTHROPIC_API_KEY) order.push('anthropic')

  return order.length > 0 ? order : [primary]
}

function getModelName(provider: 'gemini' | 'anthropic', model?: 'haiku' | 'sonnet'): string {
  if (provider === 'gemini') {
    return model === 'sonnet' ? 'gemini-2.5-pro' : 'gemini-2.5-flash'
  }
  return model === 'sonnet' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001'
}

async function callGemini(modelName: string, system: string, user: string): Promise<string> {
  const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '').getGenerativeModel({
    model: modelName,
    systemInstruction: system,
  })
  return (await model.generateContent(user)).response.text()
}

async function callAnthropic(
  modelName: string,
  normalized: AICallOptions,
  user: string
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: user }]
  if (normalized.expectJson) {
    messages.push({ role: 'assistant', content: '{' })
  }

  const res = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' }).messages.create({
    model: modelName,
    max_tokens: normalized.maxTokens ?? 1024,
    temperature: 0,
    system: [
      {
        type: 'text',
        text: normalized.system,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages,
  })

  const block = res.content[0]
  const text = block && block.type === 'text' ? block.text : ''
  return normalized.expectJson ? `{${text}` : text
}

function categorizeAiError(error: unknown): string {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  if (message.includes('credit') || message.includes('quota') || message.includes('billing')) return 'quota'
  if (message.includes('rate') || message.includes('429')) return 'rate_limit'
  if (message.includes('timeout') || message.includes('aborted')) return 'timeout'
  if (message.includes('api key') || message.includes('authentication') || message.includes('unauthorized')) {
    return 'auth'
  }
  return 'provider_error'
}

function isFallbackEligible(category: string): boolean {
  return ['quota', 'rate_limit', 'timeout', 'provider_error'].includes(category)
}
