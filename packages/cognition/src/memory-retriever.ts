import type { IVectorStore } from '../../storage/src/index.js'
import type { MemoryResult, EpisodicEntry } from '../../schema/src/index.js'
import type { LLMProvider } from '../../llm/src/index.js'
import type { MemoryManager } from '../../state/src/memory-manager.js'

const VECTOR_COLLECTION = 'memory_vectors'

export class MemoryRetriever {
  constructor(
    private vectors: IVectorStore,
    private memoryManager: MemoryManager,
    private llm: LLMProvider,
  ) {}

  // Composite scoring: 0.5 * vector_similarity + 0.3 * importance + 0.2 * recency_factor
  async retrieve(entityId: string, query: string, topK = 5): Promise<MemoryResult[]> {
    let queryEmbedding: number[]
    try {
      const result = await this.llm.embed(query)
      queryEmbedding = result.embedding
    } catch {
      // Fallback: return most recent memories by importance
      return this.fallbackRetrieve(entityId, topK)
    }

    const vectorResults = await this.vectors.search(
      VECTOR_COLLECTION,
      queryEmbedding,
      topK * 3, // over-fetch for re-ranking
      { entity_id: entityId },
    )

    const now = Date.now()
    const scored: MemoryResult[] = []

    for (const vr of vectorResults) {
      const entry = this.memoryManager.get(vr.id)
      if (!entry) continue

      const vectorScore = vr.score
      const importance = entry.importance
      const ageMs = now - new Date(entry.timestamp).getTime()
      const ageHours = ageMs / (1000 * 60 * 60)
      const recencyFactor = Math.exp(-0.01 * ageHours) // exponential decay

      const compositeScore = 0.5 * vectorScore + 0.3 * importance + 0.2 * recencyFactor

      scored.push({ entry, score: Math.min(1, Math.max(0, compositeScore)) })
    }

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, topK)
  }

  private fallbackRetrieve(entityId: string, topK: number): MemoryResult[] {
    const entries = this.memoryManager.getByEntity(entityId, topK * 2)
    return entries
      .sort((a, b) => b.importance - a.importance)
      .slice(0, topK)
      .map(entry => ({ entry, score: entry.importance }))
  }
}
