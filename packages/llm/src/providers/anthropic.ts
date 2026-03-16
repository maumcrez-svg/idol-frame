import Anthropic from '@anthropic-ai/sdk'
import type { ChatMessage, CompletionOptions, EmbeddingResult, LLMProvider } from '../types.js'
import { withRetry } from '../retry.js'

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic
  private model: string

  constructor(config?: { apiKey?: string; model?: string }) {
    this.client = new Anthropic({ apiKey: config?.apiKey ?? process.env.ANTHROPIC_API_KEY, timeout: 30000 })
    this.model = config?.model ?? process.env.IDOL_FRAME_MODEL ?? 'claude-sonnet-4-20250514'
  }

  async complete(messages: ChatMessage[], options?: CompletionOptions): Promise<string> {
    return withRetry(async () => {
      const systemMsg = messages.find(m => m.role === 'system')
      const nonSystem = messages.filter(m => m.role !== 'system')

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: options?.max_tokens ?? 4096,
        ...(systemMsg ? { system: systemMsg.content } : {}),
        messages: nonSystem.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        ...(options?.temperature != null ? { temperature: options.temperature } : {}),
      })

      const block = response.content[0]
      if (!block || block.type !== 'text') throw new Error('Anthropic returned empty response')
      return block.text
    })
  }

  async completeJSON<T = Record<string, unknown>>(messages: ChatMessage[], options?: CompletionOptions): Promise<T> {
    return withRetry(async () => {
      const augmented = messages.map(m => {
        if (m.role === 'system') {
          return { ...m, content: m.content + '\n\nIMPORTANT: Respond with valid JSON only. No markdown, no explanation.' }
        }
        return m
      })

      const raw = await this.complete(augmented, options)

      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error(`Failed to extract JSON from Anthropic response: ${raw.substring(0, 200)}`)

      try {
        return JSON.parse(jsonMatch[0]) as T
      } catch {
        throw new Error(`Failed to parse JSON from Anthropic response: ${raw.substring(0, 200)}`)
      }
    })
  }

  async embed(_text: string): Promise<EmbeddingResult> {
    throw new Error(
      'Anthropic does not support embeddings. Use OpenAI embedding model alongside Anthropic completion model. ' +
      'Set IDOL_FRAME_EMBEDDING_MODEL and OPENAI_API_KEY for embeddings.',
    )
  }

  async embedBatch(_texts: string[]): Promise<EmbeddingResult[]> {
    throw new Error(
      'Anthropic does not support embeddings. Use OpenAI embedding model alongside Anthropic completion model. ' +
      'Set IDOL_FRAME_EMBEDDING_MODEL and OPENAI_API_KEY for embeddings.',
    )
  }
}
