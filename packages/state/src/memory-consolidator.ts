import { v4 as uuid } from 'uuid'
import type { IDocumentStore, IVectorStore } from '../../storage/src/index.js'
import type { LLMProvider } from '../../llm/src/index.js'
import type { EpisodicEntry, MemoryNode } from '../../schema/src/index.js'
import { MemoryNodeSchema } from '../../schema/src/index.js'
import type { MemoryManager } from './memory-manager.js'

const NODE_COLLECTION = 'memory_nodes'
const VECTOR_COLLECTION = 'memory_vectors'

const NOTE_TYPE_RE = /^\[(opinion|event|bit|callback|thread|call)\]/i

export interface ConsolidatorConfig {
  fresh_tail_count: number
  leaf_chunk_size: number
  condensation_threshold: number
}

const DEFAULT_CONFIG: ConsolidatorConfig = {
  fresh_tail_count: 20,
  leaf_chunk_size: 8,
  condensation_threshold: 5,
}

export class MemoryConsolidator {
  private config: ConsolidatorConfig

  constructor(
    private docs: IDocumentStore,
    private vectors: IVectorStore,
    private llm: LLMProvider,
    private memoryManager: MemoryManager,
    config?: Partial<ConsolidatorConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  async consolidate(entityId: string): Promise<MemoryNode[]> {
    const unconsolidated = this.memoryManager.getUnconsolidated(entityId, this.config.fresh_tail_count)
    if (unconsolidated.length < this.config.leaf_chunk_size) return []

    // Sort oldest first for time-window grouping
    unconsolidated.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

    // Group into chunks, but high-importance entries resist compression 2x
    const chunks = this.chunkEntries(unconsolidated)
    const newNodes: MemoryNode[] = []

    // Create leaf summary nodes
    for (const chunk of chunks) {
      const node = await this.summarizeToNode(entityId, chunk, 1, 'leaf_summary')
      if (node) {
        newNodes.push(node)
        for (const entry of chunk) {
          this.memoryManager.markConsolidated(entry.id)
        }
      }
    }

    // Condense leaf nodes if there are enough
    const existingLeaves = this.getNodes(entityId, { level: 1, unconsolidated_only: true })
    const allLeaves = [...existingLeaves, ...newNodes.filter(n => n.level === 1)]

    if (allLeaves.length >= this.config.condensation_threshold) {
      const condensedChunks = this.chunkNodes(allLeaves)
      for (const nodeChunk of condensedChunks) {
        const condensed = await this.condenseNodes(entityId, nodeChunk, 2)
        if (condensed) {
          newNodes.push(condensed)
          for (const leaf of nodeChunk) {
            this.docs.update(NODE_COLLECTION, leaf.id, { consolidated: true })
          }
        }
      }
    }

    return newNodes
  }

  expand(nodeId: string): Array<EpisodicEntry | MemoryNode> {
    const node = this.docs.get(NODE_COLLECTION, nodeId) as MemoryNode | null
    if (!node) return []

    const results: Array<EpisodicEntry | MemoryNode> = []

    for (const sourceId of node.source_ids) {
      if (sourceId.startsWith('mem-')) {
        const entry = this.memoryManager.get(sourceId)
        if (entry) results.push(entry)
      } else if (sourceId.startsWith('mn-')) {
        // Recursively expand sub-nodes
        const subNode = this.docs.get(NODE_COLLECTION, sourceId) as MemoryNode | null
        if (subNode) {
          results.push(subNode)
          results.push(...this.expand(sourceId))
        }
      }
    }

    return results
  }

  getNodes(entityId: string, opts?: { level?: number; unconsolidated_only?: boolean }): MemoryNode[] {
    let nodes = this.docs.list(NODE_COLLECTION, { entity_id: entityId })
      .map(d => MemoryNodeSchema.parse(d))

    if (opts?.level !== undefined) {
      nodes = nodes.filter(n => n.level === opts.level)
    }
    if (opts?.unconsolidated_only) {
      nodes = nodes.filter(n => !n.consolidated)
    }

    return nodes.sort((a, b) => b.time_range.end.localeCompare(a.time_range.end))
  }

  private chunkEntries(entries: EpisodicEntry[]): EpisodicEntry[][] {
    const chunks: EpisodicEntry[][] = []
    let current: EpisodicEntry[] = []
    let effectiveSize = 0

    for (const entry of entries) {
      // High-importance entries count double toward chunk size (resist compression 2x)
      const weight = entry.importance >= 0.7 ? 2 : 1
      current.push(entry)
      effectiveSize += weight

      if (effectiveSize >= this.config.leaf_chunk_size) {
        chunks.push(current)
        current = []
        effectiveSize = 0
      }
    }

    // Don't create undersized chunks — leave them for next consolidation
    if (current.length >= this.config.leaf_chunk_size / 2) {
      chunks.push(current)
    }

    return chunks
  }

  private chunkNodes(nodes: MemoryNode[]): MemoryNode[][] {
    const chunks: MemoryNode[][] = []
    for (let i = 0; i < nodes.length; i += this.config.condensation_threshold) {
      const chunk = nodes.slice(i, i + this.config.condensation_threshold)
      if (chunk.length >= 3) chunks.push(chunk)
    }
    return chunks
  }

  private extractNoteTypes(content: string): string[] {
    const types = new Set<string>()
    for (const line of content.split('\n')) {
      const match = line.match(NOTE_TYPE_RE)
      if (match) types.add(match[1].toLowerCase())
    }
    return [...types]
  }

  private async summarizeToNode(
    entityId: string,
    entries: EpisodicEntry[],
    level: number,
    type: 'leaf_summary' | 'condensed',
  ): Promise<MemoryNode | null> {
    const entriesText = entries
      .map(e => `[${e.timestamp}] (importance: ${e.importance}) ${e.content}`)
      .join('\n')

    const noteTypes = new Set<string>()
    for (const e of entries) {
      for (const t of this.extractNoteTypes(e.content)) {
        noteTypes.add(t)
      }
    }

    const summary = await this.llm.complete([
      {
        role: 'system',
        content: `You are a memory consolidation engine. Summarize the following episodic memory entries into a concise summary that preserves key facts, opinions, events, and continuity details.

RULES:
- Preserve typed prefixes like [opinion], [call], [event], [bit], [callback], [thread] when present
- Retain specific names, dates, numbers, and concrete details
- Higher importance entries should get more weight in the summary
- Keep the summary under 500 words
- Write in third person past tense
- Do NOT add commentary or meta-analysis — just consolidate the facts`,
      },
      { role: 'user', content: entriesText },
    ], { temperature: 0.3, max_tokens: 800 })

    // Generate embedding for the summary
    let embedding: number[] | null = null
    try {
      const result = await this.llm.embed(summary)
      embedding = result.embedding
    } catch {
      // Continue without embedding
    }

    const timestamps = entries.map(e => e.timestamp).sort()
    const maxImportance = Math.max(...entries.map(e => e.importance))
    const tokenCount = Math.ceil(summary.length / 4) // rough estimate

    const node: MemoryNode = MemoryNodeSchema.parse({
      id: `mn-${uuid()}`,
      entity_id: entityId,
      type,
      content: summary,
      source_ids: entries.map(e => e.id),
      level,
      token_count: tokenCount,
      importance: maxImportance,
      time_range: {
        start: timestamps[0],
        end: timestamps[timestamps.length - 1],
      },
      note_types: [...noteTypes],
      embedding,
      consolidated: false,
      created_at: new Date().toISOString(),
    })

    this.docs.put(NODE_COLLECTION, node.id, node)

    if (embedding) {
      await this.vectors.upsert(VECTOR_COLLECTION, node.id, embedding, {
        entity_id: entityId,
        importance: node.importance,
        timestamp: node.created_at,
        level: node.level,
        type: node.type,
      })
    }

    return node
  }

  private async condenseNodes(
    entityId: string,
    nodes: MemoryNode[],
    level: number,
  ): Promise<MemoryNode | null> {
    const nodesText = nodes
      .map(n => `[${n.time_range.start} - ${n.time_range.end}] (importance: ${n.importance}, types: ${n.note_types.join(',')}) ${n.content}`)
      .join('\n\n')

    const allNoteTypes = new Set<string>()
    for (const n of nodes) {
      for (const t of n.note_types) allNoteTypes.add(t)
    }

    const summary = await this.llm.complete([
      {
        role: 'system',
        content: `You are a memory consolidation engine performing higher-level condensation. Merge these summary nodes into a single cohesive summary.

RULES:
- Preserve typed prefixes like [opinion], [call], [event], [bit], [callback], [thread]
- Retain the most important facts and patterns across time
- Higher importance summaries should get proportionally more space
- Keep under 400 words
- Write in third person past tense
- Focus on patterns, evolution, and key moments`,
      },
      { role: 'user', content: nodesText },
    ], { temperature: 0.3, max_tokens: 600 })

    let embedding: number[] | null = null
    try {
      const result = await this.llm.embed(summary)
      embedding = result.embedding
    } catch {
      // Continue without embedding
    }

    const allTimestamps = nodes.flatMap(n => [n.time_range.start, n.time_range.end]).sort()
    const maxImportance = Math.max(...nodes.map(n => n.importance))
    const tokenCount = Math.ceil(summary.length / 4)

    const node: MemoryNode = MemoryNodeSchema.parse({
      id: `mn-${uuid()}`,
      entity_id: entityId,
      type: 'condensed',
      content: summary,
      source_ids: nodes.map(n => n.id),
      level,
      token_count: tokenCount,
      importance: maxImportance,
      time_range: {
        start: allTimestamps[0],
        end: allTimestamps[allTimestamps.length - 1],
      },
      note_types: [...allNoteTypes],
      embedding,
      consolidated: false,
      created_at: new Date().toISOString(),
    })

    this.docs.put(NODE_COLLECTION, node.id, node)

    if (embedding) {
      await this.vectors.upsert(VECTOR_COLLECTION, node.id, embedding, {
        entity_id: entityId,
        importance: node.importance,
        timestamp: node.created_at,
        level: node.level,
        type: node.type,
      })
    }

    return node
  }
}
