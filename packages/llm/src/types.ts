export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface CompletionOptions {
  temperature?: number
  max_tokens?: number
  response_format?: 'text' | 'json'
}

export interface EmbeddingResult {
  embedding: number[]
  token_count: number
}

export interface LLMProvider {
  complete(messages: ChatMessage[], options?: CompletionOptions): Promise<string>
  completeJSON<T = Record<string, unknown>>(messages: ChatMessage[], options?: CompletionOptions): Promise<T>
  embed(text: string): Promise<EmbeddingResult>
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>
}

export type LLMCallFn = (systemPrompt: string, userMessage: string) => Promise<string>
