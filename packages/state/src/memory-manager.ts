import { v4 as uuid } from 'uuid'
import type { IDocumentStore, IVectorStore } from '../../storage/src/index.js'
import type { EpisodicEntry } from '../../schema/src/index.js'
import { EpisodicEntrySchema } from '../../schema/src/index.js'
import type { LLMProvider } from '../../llm/src/index.js'

const COLLECTION = 'episodic_memory'
const VECTOR_COLLECTION = 'memory_vectors'

export class MemoryManager {
  constructor(
    private docs: IDocumentStore,
    private vectors: IVectorStore,
    private llm: LLMProvider,
  ) {}

  async store(input: {
    entity_id: string
    content: string
    context?: string
    importance?: number
  }): Promise<EpisodicEntry> {
    const now = new Date().toISOString()

    // Generate embedding
    let embedding: number[] | null = null
    try {
      const result = await this.llm.embed(input.content)
      embedding = result.embedding
    } catch {
      // Continue without embedding -- search will be degraded but not broken
    }

    const entry: EpisodicEntry = EpisodicEntrySchema.parse({
      id: `mem-${uuid()}`,
      entity_id: input.entity_id,
      content: input.content,
      context: input.context ?? '',
      importance: input.importance ?? 0.5,
      timestamp: now,
      embedding,
      decay_rate: 0.01,
    })

    this.docs.put(COLLECTION, entry.id, entry)

    if (embedding) {
      await this.vectors.upsert(VECTOR_COLLECTION, entry.id, embedding, {
        entity_id: input.entity_id,
        importance: entry.importance,
        timestamp: now,
      })
    }

    return entry
  }

  getByEntity(entityId: string, limit = 50): EpisodicEntry[] {
    return this.docs.list(COLLECTION, { entity_id: entityId })
      .map(d => EpisodicEntrySchema.parse(d))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit)
  }

  get(id: string): EpisodicEntry | null {
    const doc = this.docs.get(COLLECTION, id)
    return doc ? EpisodicEntrySchema.parse(doc) : null
  }
}
