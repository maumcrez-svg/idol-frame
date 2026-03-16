import OpenAI from 'openai'
import type { ChatMessage, CompletionOptions, EmbeddingResult, LLMProvider } from '../types.js'
import { withRetry } from '../retry.js'

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI
  private model: string
  private embeddingModel: string

  constructor(config?: { apiKey?: string; model?: string; embeddingModel?: string }) {
    this.client = new OpenAI({ apiKey: config?.apiKey ?? process.env.OPENAI_API_KEY, timeout: 30000 })
    this.model = config?.model ?? process.env.IDOL_FRAME_MODEL ?? 'gpt-4o'
    this.embeddingModel = config?.embeddingModel ?? process.env.IDOL_FRAME_EMBEDDING_MODEL ?? 'text-embedding-3-small'
  }

  async complete(messages: ChatMessage[], options?: CompletionOptions): Promise<string> {
    return withRetry(async () => {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.max_tokens,
        ...(options?.response_format === 'json' ? { response_format: { type: 'json_object' } } : {}),
      })

      const content = response.choices[0]?.message?.content
      if (!content) throw new Error('OpenAI returned empty response')
      return content
    })
  }

  async completeJSON<T = Record<string, unknown>>(messages: ChatMessage[], options?: CompletionOptions): Promise<T> {
    return withRetry(async () => {
      const raw = await this.complete(messages, { ...options, response_format: 'json' })
      try {
        return JSON.parse(raw) as T
      } catch {
        throw new Error(`Failed to parse JSON from OpenAI response: ${raw.substring(0, 200)}`)
      }
    })
  }

  async embed(text: string): Promise<EmbeddingResult> {
    return withRetry(async () => {
      const response = await this.client.embeddings.create({
        model: this.embeddingModel,
        input: text,
      })
      return {
        embedding: response.data[0].embedding,
        token_count: response.usage.total_tokens,
      }
    })
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const response = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: texts,
    })
    return response.data.map((d, i) => ({
      embedding: d.embedding,
      token_count: Math.ceil(response.usage.total_tokens / texts.length),
    }))
  }
}
