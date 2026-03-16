import { OpenAIProvider } from './providers/openai.js'
import { AnthropicProvider } from './providers/anthropic.js'
import type { LLMProvider, LLMCallFn } from './types.js'

export type { ChatMessage, CompletionOptions, EmbeddingResult, LLMProvider, LLMCallFn } from './types.js'

export interface ProviderConfig {
  provider?: 'openai' | 'anthropic'
  model?: string
  embeddingModel?: string
  apiKey?: string
}

export function createProvider(config?: ProviderConfig): LLMProvider {
  const providerName = config?.provider ?? process.env.IDOL_FRAME_PROVIDER ?? 'openai'

  switch (providerName) {
    case 'openai':
      return new OpenAIProvider({
        apiKey: config?.apiKey,
        model: config?.model,
        embeddingModel: config?.embeddingModel,
      })
    case 'anthropic':
      return new AnthropicProvider({
        apiKey: config?.apiKey,
        model: config?.model,
      })
    default:
      throw new Error(`Unknown LLM provider: ${providerName}. Supported: openai, anthropic`)
  }
}

export function toLLMCallFn(provider: LLMProvider): LLMCallFn {
  return async (systemPrompt: string, userMessage: string): Promise<string> => {
    return provider.complete([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ])
  }
}

export { OpenAIProvider } from './providers/openai.js'
export { AnthropicProvider } from './providers/anthropic.js'
export { withRetry } from './retry.js'
