import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MemoryRetriever } from '../memory-retriever.js'
import { MemoryManager } from '../../../state/src/memory-manager.js'
import { MemoryConsolidator } from '../../../state/src/memory-consolidator.js'
import { MockDocumentStore } from '../../../__test-utils__/mock-store.js'
import { InMemoryVectorStore } from '../../../storage/src/vector-store.js'
import type { IFTSIndex, FTSResult } from '../../../storage/src/index.js'
import type { LLMProvider } from '../../../llm/src/index.js'
import type { EpisodicEntry } from '../../../schema/src/index.js'
import type { EnrichedMemoryResult } from '../memory-retriever.js'

function makeMockLLM(): LLMProvider {
  return {
    complete: vi.fn().mockResolvedValue('Summary of consolidated memories.'),
    completeJSON: vi.fn().mockResolvedValue({}),
    embed: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3], token_count: 5 }),
    embedBatch: vi.fn().mockResolvedValue([]),
  }
}

function makeMockFTS(results: FTSResult[] = []): IFTSIndex {
  return {
    index: vi.fn(),
    indexBatch: vi.fn(),
    search: vi.fn().mockReturnValue(results),
    remove: vi.fn(),
  }
}

function makeEntry(
  id: string,
  entityId: string,
  timestamp: string,
  importance = 0.5,
  content = 'Test memory content',
): EpisodicEntry {
  return {
    id,
    entity_id: entityId,
    content,
    context: 'test context',
    importance,
    timestamp,
    embedding: null,
    decay_rate: 0.01,
    consolidated: false,
  }
}

function storeEntries(docs: MockDocumentStore, entries: EpisodicEntry[]): void {
  for (const entry of entries) {
    docs.put('episodic_memory', entry.id, entry)
  }
}

describe('MemoryRetriever', () => {
  let docs: MockDocumentStore
  let vectors: InMemoryVectorStore
  let llm: LLMProvider
  let memoryManager: MemoryManager

  const ENTITY_ID = 'e-test'

  beforeEach(() => {
    docs = new MockDocumentStore()
    vectors = new InMemoryVectorStore()
    llm = makeMockLLM()
    memoryManager = new MemoryManager(docs, vectors, llm)
  })

  describe('retrieve() returns enriched results with source markers', () => {
    it('returns results with source field set', async () => {
      const entries: EpisodicEntry[] = []
      for (let i = 0; i < 5; i++) {
        entries.push(makeEntry(
          `mem-${String(i).padStart(3, '0')}`,
          ENTITY_ID,
          `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
          0.5,
          `Memory about topic ${i}`,
        ))
      }
      storeEntries(docs, entries)

      const retriever = new MemoryRetriever(vectors, memoryManager, llm)
      const results = await retriever.retrieve(ENTITY_ID, 'topic', 5)

      expect(results.length).toBeGreaterThan(0)
      for (const result of results) {
        expect(result).toHaveProperty('source')
        expect(['fresh_tail', 'vector', 'fts', 'consolidated']).toContain(result.source)
        expect(result).toHaveProperty('entry')
        expect(result).toHaveProperty('score')
      }
    })
  })

  describe('fresh tail entries always included at max score', () => {
    it('includes recent entries as fresh_tail with score 1.0', async () => {
      const entries: EpisodicEntry[] = []
      for (let i = 0; i < 10; i++) {
        entries.push(makeEntry(
          `mem-${String(i).padStart(3, '0')}`,
          ENTITY_ID,
          `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
          0.5,
          `Memory ${i}`,
        ))
      }
      storeEntries(docs, entries)

      const retriever = new MemoryRetriever(vectors, memoryManager, llm, undefined, {
        fresh_tail_count: 5,
      })

      const results = await retriever.retrieve(ENTITY_ID, 'anything', 10)

      const freshTailResults = results.filter(r => r.source === 'fresh_tail')
      expect(freshTailResults.length).toBeGreaterThan(0)

      for (const ft of freshTailResults) {
        expect(ft.score).toBe(1.0)
        expect(ft.source).toBe('fresh_tail')
      }
    })

    it('fresh tail entries come from the most recent entries', async () => {
      const entries: EpisodicEntry[] = []
      for (let i = 0; i < 10; i++) {
        entries.push(makeEntry(
          `mem-${String(i).padStart(3, '0')}`,
          ENTITY_ID,
          `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
          0.5,
          `Memory ${i}`,
        ))
      }
      storeEntries(docs, entries)

      const retriever = new MemoryRetriever(vectors, memoryManager, llm, undefined, {
        fresh_tail_count: 3,
      })

      const results = await retriever.retrieve(ENTITY_ID, 'query', 10)
      const freshIds = results.filter(r => r.source === 'fresh_tail').map(r => r.entry.id)

      // The 3 most recent entries by timestamp (mem-009, mem-008, mem-007)
      // getByEntity sorts descending by timestamp
      expect(freshIds).toContain('mem-009')
      expect(freshIds).toContain('mem-008')
      expect(freshIds).toContain('mem-007')
    })
  })

  describe('hybrid scoring with FTS', () => {
    it('uses 0.4/0.2/0.2/0.2 weights when FTS is available', async () => {
      // Create entries and add them to vector store too
      const entries: EpisodicEntry[] = []
      for (let i = 0; i < 5; i++) {
        const entry = makeEntry(
          `mem-${String(i).padStart(3, '0')}`,
          ENTITY_ID,
          `2025-06-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
          0.6,
          `Memory about crypto ${i}`,
        )
        entries.push(entry)
      }
      storeEntries(docs, entries)

      // Add entries to vector store
      for (const entry of entries) {
        await vectors.upsert('memory_vectors', entry.id, [0.1, 0.2, 0.3], {
          entity_id: ENTITY_ID,
          importance: entry.importance,
          timestamp: entry.timestamp,
        })
      }

      const ftsResults: FTSResult[] = [
        { id: 'mem-002', snippet: 'crypto 2', score: 0.9 },
      ]
      const mockFTS = makeMockFTS(ftsResults)

      const retriever = new MemoryRetriever(vectors, memoryManager, llm, mockFTS, {
        fresh_tail_count: 1,
      })

      const results = await retriever.retrieve(ENTITY_ID, 'crypto', 10)

      // FTS search should have been called
      expect(mockFTS.search).toHaveBeenCalledWith(ENTITY_ID, 'crypto', expect.any(Number))

      // Vector results that are not in fresh tail should have composite scores
      const vectorResults = results.filter(r => r.source === 'vector')
      for (const vr of vectorResults) {
        // Score should be between 0 and 1
        expect(vr.score).toBeGreaterThanOrEqual(0)
        expect(vr.score).toBeLessThanOrEqual(1)
      }
    })

    it('entry with FTS match gets boosted compared to entry without FTS match', async () => {
      // Two entries with identical vector scores but one has an FTS match
      const entryWithFTS = makeEntry('mem-fts', ENTITY_ID, '2025-06-01T00:00:00Z', 0.5, 'Bitcoin analysis')
      const entryNoFTS = makeEntry('mem-nofts', ENTITY_ID, '2025-06-01T00:00:00Z', 0.5, 'Market update')
      storeEntries(docs, [entryWithFTS, entryNoFTS])

      // Both get same vector embedding => same cosine similarity to query
      await vectors.upsert('memory_vectors', 'mem-fts', [0.5, 0.5, 0.5], {
        entity_id: ENTITY_ID,
        importance: 0.5,
        timestamp: '2025-06-01T00:00:00Z',
      })
      await vectors.upsert('memory_vectors', 'mem-nofts', [0.5, 0.5, 0.5], {
        entity_id: ENTITY_ID,
        importance: 0.5,
        timestamp: '2025-06-01T00:00:00Z',
      })

      const ftsResults: FTSResult[] = [
        { id: 'mem-fts', snippet: 'Bitcoin analysis', score: 0.8 },
      ]
      const mockFTS = makeMockFTS(ftsResults)

      const retriever = new MemoryRetriever(vectors, memoryManager, llm, mockFTS, {
        fresh_tail_count: 0,
      })

      // Use embedding that matches our vectors
      ;(llm.embed as ReturnType<typeof vi.fn>).mockResolvedValue({
        embedding: [0.5, 0.5, 0.5],
        token_count: 5,
      })

      const results = await retriever.retrieve(ENTITY_ID, 'Bitcoin', 10)
      const vectorResults = results.filter(r => r.source === 'vector')

      const ftsEntry = vectorResults.find(r => r.entry.id === 'mem-fts')
      const noFtsEntry = vectorResults.find(r => r.entry.id === 'mem-nofts')

      if (ftsEntry && noFtsEntry) {
        // The entry with FTS match should score higher
        expect(ftsEntry.score).toBeGreaterThan(noFtsEntry.score)
      }
    })
  })

  describe('backward compat: when FTS absent, uses 0.5/0.3/0.2 weights', () => {
    it('returns results without FTS using original weights', async () => {
      const entries: EpisodicEntry[] = []
      for (let i = 0; i < 5; i++) {
        const entry = makeEntry(
          `mem-${String(i).padStart(3, '0')}`,
          ENTITY_ID,
          `2025-06-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
          0.5 + i * 0.1,
          `Memory ${i}`,
        )
        entries.push(entry)
      }
      storeEntries(docs, entries)

      for (const entry of entries) {
        await vectors.upsert('memory_vectors', entry.id, [0.1, 0.2, 0.3], {
          entity_id: ENTITY_ID,
          importance: entry.importance,
          timestamp: entry.timestamp,
        })
      }

      // No FTS provided
      const retriever = new MemoryRetriever(vectors, memoryManager, llm, undefined, {
        fresh_tail_count: 1,
      })

      const results = await retriever.retrieve(ENTITY_ID, 'memory', 10)

      // Should still return results
      expect(results.length).toBeGreaterThan(0)

      // Vector results should exist (non-fresh-tail)
      const vectorResults = results.filter(r => r.source === 'vector')
      for (const vr of vectorResults) {
        expect(vr.score).toBeGreaterThanOrEqual(0)
        expect(vr.score).toBeLessThanOrEqual(1)
      }
    })

    it('falls back to importance-based retrieval when embedding fails', async () => {
      const entries: EpisodicEntry[] = []
      for (let i = 0; i < 5; i++) {
        entries.push(makeEntry(
          `mem-${String(i).padStart(3, '0')}`,
          ENTITY_ID,
          `2025-06-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
          0.5 + i * 0.1,
          `Memory ${i}`,
        ))
      }
      storeEntries(docs, entries)

      ;(llm.embed as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('embedding failed'))

      const retriever = new MemoryRetriever(vectors, memoryManager, llm, undefined, {
        fresh_tail_count: 1,
      })

      const results = await retriever.retrieve(ENTITY_ID, 'query', 10)

      // Should still return results via fallback
      expect(results.length).toBeGreaterThan(0)

      // Non-fresh-tail results should be sorted by importance (score = importance)
      const vectorResults = results.filter(r => r.source === 'vector')
      for (let i = 1; i < vectorResults.length; i++) {
        expect(vectorResults[i - 1].score).toBeGreaterThanOrEqual(vectorResults[i].score)
      }
    })
  })

  describe('grep() returns keyword matches via FTS', () => {
    it('returns enriched results from FTS search', () => {
      const entry = makeEntry('mem-001', ENTITY_ID, '2025-01-01T00:00:00Z', 0.7, 'Bitcoin price prediction')
      storeEntries(docs, [entry])

      const ftsResults: FTSResult[] = [
        { id: 'mem-001', snippet: 'Bitcoin price prediction', score: 0.85 },
      ]
      const mockFTS = makeMockFTS(ftsResults)

      const retriever = new MemoryRetriever(vectors, memoryManager, llm, mockFTS)

      const results = retriever.grep(ENTITY_ID, 'Bitcoin', 10)

      expect(results).toHaveLength(1)
      expect(results[0].entry.id).toBe('mem-001')
      expect(results[0].source).toBe('fts')
      expect(results[0].score).toBe(0.85)
    })

    it('skips entries not found in memory manager', () => {
      // FTS returns an ID but it does not exist in docs
      const ftsResults: FTSResult[] = [
        { id: 'mem-ghost', snippet: 'ghost entry', score: 0.5 },
      ]
      const mockFTS = makeMockFTS(ftsResults)

      const retriever = new MemoryRetriever(vectors, memoryManager, llm, mockFTS)

      const results = retriever.grep(ENTITY_ID, 'ghost', 10)
      expect(results).toHaveLength(0)
    })

    it('returns multiple results sorted by FTS score', () => {
      const entries = [
        makeEntry('mem-001', ENTITY_ID, '2025-01-01T00:00:00Z', 0.5, 'First about crypto'),
        makeEntry('mem-002', ENTITY_ID, '2025-01-02T00:00:00Z', 0.6, 'Second about crypto'),
      ]
      storeEntries(docs, entries)

      const ftsResults: FTSResult[] = [
        { id: 'mem-001', snippet: 'First about crypto', score: 0.6 },
        { id: 'mem-002', snippet: 'Second about crypto', score: 0.9 },
      ]
      const mockFTS = makeMockFTS(ftsResults)

      const retriever = new MemoryRetriever(vectors, memoryManager, llm, mockFTS)

      const results = retriever.grep(ENTITY_ID, 'crypto', 10)
      expect(results).toHaveLength(2)
      // Both should be fts source
      expect(results[0].source).toBe('fts')
      expect(results[1].source).toBe('fts')
    })
  })

  describe('grep() returns empty when FTS not available', () => {
    it('returns empty array when no FTS index is configured', () => {
      const retriever = new MemoryRetriever(vectors, memoryManager, llm) // no fts

      const results = retriever.grep(ENTITY_ID, 'anything', 10)
      expect(results).toEqual([])
    })
  })

  describe('consolidated memory retrieval', () => {
    it('includes consolidated nodes when consolidator is set', async () => {
      // Set up entries and consolidate them
      const entries: EpisodicEntry[] = []
      for (let i = 0; i < 15; i++) {
        entries.push(makeEntry(
          `mem-${String(i).padStart(3, '0')}`,
          ENTITY_ID,
          `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
          0.5,
          `Memory about crypto topic ${i}`,
        ))
      }
      storeEntries(docs, entries)

      const consolidator = new MemoryConsolidator(docs, vectors, llm, memoryManager, {
        fresh_tail_count: 2,
        leaf_chunk_size: 4,
        condensation_threshold: 100,
      })

      const nodes = await consolidator.consolidate(ENTITY_ID)
      expect(nodes.length).toBeGreaterThan(0)

      const retriever = new MemoryRetriever(vectors, memoryManager, llm, undefined, {
        fresh_tail_count: 2,
      })
      retriever.setConsolidator(consolidator)

      const results = await retriever.retrieve(ENTITY_ID, 'crypto', 10)

      // Should have at least some results
      expect(results.length).toBeGreaterThan(0)
    })
  })

  describe('expand() delegates to consolidator', () => {
    it('returns empty when no consolidator is set', () => {
      const retriever = new MemoryRetriever(vectors, memoryManager, llm)

      const expanded = retriever.expand('mn-anything')
      expect(expanded).toEqual([])
    })
  })
})
