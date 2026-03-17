import type { IVectorStore, IFTSIndex } from '../../storage/src/index.js'
import type { MemoryResult, EpisodicEntry, MemoryNode } from '../../schema/src/index.js'
import type { LLMProvider } from '../../llm/src/index.js'
import type { MemoryManager } from '../../state/src/memory-manager.js'
import type { MemoryConsolidator } from '../../state/src/memory-consolidator.js'

const VECTOR_COLLECTION = 'memory_vectors'

export interface EnrichedMemoryResult extends MemoryResult {
  source: 'fresh_tail' | 'vector' | 'fts' | 'consolidated'
}

export interface RetrieverConfig {
  fresh_tail_count: number
}

const DEFAULT_CONFIG: RetrieverConfig = {
  fresh_tail_count: 20,
}

export class MemoryRetriever {
  private fts?: IFTSIndex
  private consolidator?: MemoryConsolidator
  private config: RetrieverConfig

  constructor(
    private vectors: IVectorStore,
    private memoryManager: MemoryManager,
    private llm: LLMProvider,
    fts?: IFTSIndex,
    config?: Partial<RetrieverConfig>,
  ) {
    this.fts = fts
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  setConsolidator(consolidator: MemoryConsolidator): void {
    this.consolidator = consolidator
  }

  async retrieve(entityId: string, query: string, topK = 5): Promise<EnrichedMemoryResult[]> {
    // Fresh tail: last N entries always included
    const freshTail = this.memoryManager.getByEntity(entityId, this.config.fresh_tail_count)
    const freshTailIds = new Set(freshTail.map(e => e.id))

    const freshTailResults: EnrichedMemoryResult[] = freshTail
      .slice(0, Math.min(topK, freshTail.length))
      .map(entry => ({ entry, score: 1.0, source: 'fresh_tail' as const }))

    // Vector search
    let vectorScored: EnrichedMemoryResult[] = []
    let queryEmbedding: number[] | undefined

    try {
      const result = await this.llm.embed(query)
      queryEmbedding = result.embedding
    } catch {
      // Fallback below
    }

    if (queryEmbedding) {
      const vectorResults = await this.vectors.search(
        VECTOR_COLLECTION,
        queryEmbedding,
        topK * 3,
        { entity_id: entityId },
      )

      const now = Date.now()

      // FTS scores indexed by ID
      const ftsScores = new Map<string, number>()
      if (this.fts) {
        const ftsResults = this.fts.search(entityId, query, topK * 3)
        for (const fr of ftsResults) {
          ftsScores.set(fr.id, fr.score)
        }
      }

      for (const vr of vectorResults) {
        if (freshTailIds.has(vr.id)) continue // already in fresh tail

        // Check if this is a memory node (consolidated summary)
        if (vr.id.startsWith('mn-')) {
          // Handle consolidated nodes separately below
          continue
        }

        const entry = this.memoryManager.get(vr.id)
        if (!entry) continue

        const vectorScore = vr.score
        const importance = entry.importance
        const ageMs = now - new Date(entry.timestamp).getTime()
        const ageHours = ageMs / (1000 * 60 * 60)
        const recencyFactor = Math.exp(-0.01 * ageHours)

        let compositeScore: number
        if (this.fts) {
          // Hybrid: 0.4*vector + 0.2*fts + 0.2*importance + 0.2*recency
          const ftsScore = ftsScores.get(vr.id) ?? 0
          compositeScore = 0.4 * vectorScore + 0.2 * ftsScore + 0.2 * importance + 0.2 * recencyFactor
        } else {
          // Original weights when FTS absent
          compositeScore = 0.5 * vectorScore + 0.3 * importance + 0.2 * recencyFactor
        }

        vectorScored.push({
          entry,
          score: Math.min(1, Math.max(0, compositeScore)),
          source: 'vector',
        })
      }

      // Also search consolidated nodes
      if (this.consolidator) {
        const consolidatedResults = await this.vectors.search(
          VECTOR_COLLECTION,
          queryEmbedding,
          topK,
          { entity_id: entityId, type: 'leaf_summary' },
        )
        const condensedResults = await this.vectors.search(
          VECTOR_COLLECTION,
          queryEmbedding,
          topK,
          { entity_id: entityId, type: 'condensed' },
        )

        for (const cr of [...consolidatedResults, ...condensedResults]) {
          if (!cr.id.startsWith('mn-')) continue
          // Create a synthetic entry from the node for display
          const nodeDoc = this.consolidator.getNodes(entityId).find(n => n.id === cr.id)
          if (!nodeDoc) continue

          const syntheticEntry: EpisodicEntry = {
            id: nodeDoc.id,
            entity_id: entityId,
            content: nodeDoc.content,
            context: `Consolidated summary (level ${nodeDoc.level}, ${nodeDoc.source_ids.length} sources)`,
            importance: nodeDoc.importance,
            timestamp: nodeDoc.time_range.end,
            embedding: null,
            decay_rate: 0,
            consolidated: false,
          }

          vectorScored.push({
            entry: syntheticEntry,
            score: Math.min(1, Math.max(0, cr.score * 0.8)), // slight discount for summaries
            source: 'consolidated',
          })
        }
      }
    } else {
      // Fallback: importance-based retrieval
      const entries = this.memoryManager.getByEntity(entityId, topK * 2)
      vectorScored = entries
        .filter(e => !freshTailIds.has(e.id))
        .sort((a, b) => b.importance - a.importance)
        .slice(0, topK)
        .map(entry => ({ entry, score: entry.importance, source: 'vector' as const }))
    }

    // Merge: fresh tail first, then scored results
    vectorScored.sort((a, b) => b.score - a.score)
    const remaining = topK - freshTailResults.length
    const merged = [...freshTailResults, ...vectorScored.slice(0, Math.max(0, remaining))]

    return merged
  }

  grep(entityId: string, keyword: string, limit = 10): EnrichedMemoryResult[] {
    if (!this.fts) return []

    const ftsResults = this.fts.search(entityId, keyword, limit)
    const results: EnrichedMemoryResult[] = []

    for (const fr of ftsResults) {
      const entry = this.memoryManager.get(fr.id)
      if (!entry) continue

      results.push({
        entry,
        score: fr.score,
        source: 'fts',
      })
    }

    return results
  }

  expand(nodeId: string): Array<EpisodicEntry | MemoryNode> {
    if (!this.consolidator) return []
    return this.consolidator.expand(nodeId)
  }
}
