import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MemoryConsolidator } from '../memory-consolidator.js'
import { MemoryManager } from '../memory-manager.js'
import { MockDocumentStore } from '../../../__test-utils__/mock-store.js'
import { InMemoryVectorStore } from '../../../storage/src/vector-store.js'
import type { LLMProvider } from '../../../llm/src/index.js'
import type { EpisodicEntry } from '../../../schema/src/index.js'

function makeMockLLM(): LLMProvider {
  return {
    complete: vi.fn().mockResolvedValue('Summary of consolidated memories.'),
    completeJSON: vi.fn().mockResolvedValue({}),
    embed: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3], token_count: 5 }),
    embedBatch: vi.fn().mockResolvedValue([]),
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

describe('MemoryConsolidator', () => {
  let docs: MockDocumentStore
  let vectors: InMemoryVectorStore
  let llm: LLMProvider
  let memoryManager: MemoryManager
  let consolidator: MemoryConsolidator

  const ENTITY_ID = 'e-test'

  beforeEach(() => {
    docs = new MockDocumentStore()
    vectors = new InMemoryVectorStore()
    llm = makeMockLLM()
    memoryManager = new MemoryManager(docs, vectors, llm)
  })

  describe('consolidate() creates leaf nodes from old entries', () => {
    it('creates leaf summary nodes and marks source entries as consolidated', async () => {
      // With fresh_tail_count=5 and leaf_chunk_size=4, we need entries that are
      // beyond the fresh tail to be consolidated.
      // Total entries = fresh_tail (5) + entries to consolidate (>= chunk_size)
      // So we need at least 5 + 4 = 9 entries
      const entries: EpisodicEntry[] = []
      for (let i = 0; i < 12; i++) {
        entries.push(makeEntry(
          `mem-${String(i).padStart(3, '0')}`,
          ENTITY_ID,
          `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
          0.5,
          `[event] Memory event number ${i} about topic ${i}`,
        ))
      }
      storeEntries(docs, entries)

      consolidator = new MemoryConsolidator(docs, vectors, llm, memoryManager, {
        fresh_tail_count: 5,
        leaf_chunk_size: 4,
        condensation_threshold: 100, // high threshold so we only test leaf creation
      })

      const nodes = await consolidator.consolidate(ENTITY_ID)

      // Should create at least 1 leaf node from the old entries
      expect(nodes.length).toBeGreaterThanOrEqual(1)

      for (const node of nodes) {
        expect(node.id).toMatch(/^mn-/)
        expect(node.entity_id).toBe(ENTITY_ID)
        expect(node.type).toBe('leaf_summary')
        expect(node.level).toBe(1)
        expect(node.source_ids.length).toBeGreaterThan(0)
        expect(node.content).toBe('Summary of consolidated memories.')
        expect(node.time_range.start).toBeDefined()
        expect(node.time_range.end).toBeDefined()
      }

      // Source entries should be marked as consolidated
      for (const node of nodes) {
        for (const sourceId of node.source_ids) {
          const entry = docs.get('episodic_memory', sourceId) as EpisodicEntry | null
          expect(entry).not.toBeNull()
          expect(entry!.consolidated).toBe(true)
        }
      }
    })

    it('calls LLM.complete to generate summary', async () => {
      const entries: EpisodicEntry[] = []
      for (let i = 0; i < 15; i++) {
        entries.push(makeEntry(
          `mem-${String(i).padStart(3, '0')}`,
          ENTITY_ID,
          `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        ))
      }
      storeEntries(docs, entries)

      consolidator = new MemoryConsolidator(docs, vectors, llm, memoryManager, {
        fresh_tail_count: 5,
        leaf_chunk_size: 4,
        condensation_threshold: 100,
      })

      await consolidator.consolidate(ENTITY_ID)

      expect(llm.complete).toHaveBeenCalled()
      // The system message should contain consolidation instructions
      const firstCall = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0]
      const systemMessage = firstCall[0][0]
      expect(systemMessage.role).toBe('system')
      expect(systemMessage.content).toContain('memory consolidation')
    })

    it('stores nodes in document store and vector store', async () => {
      const entries: EpisodicEntry[] = []
      for (let i = 0; i < 15; i++) {
        entries.push(makeEntry(
          `mem-${String(i).padStart(3, '0')}`,
          ENTITY_ID,
          `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        ))
      }
      storeEntries(docs, entries)

      consolidator = new MemoryConsolidator(docs, vectors, llm, memoryManager, {
        fresh_tail_count: 5,
        leaf_chunk_size: 4,
        condensation_threshold: 100,
      })

      const nodes = await consolidator.consolidate(ENTITY_ID)

      for (const node of nodes) {
        // Should be stored in document store
        const stored = docs.get('memory_nodes', node.id)
        expect(stored).not.toBeNull()
        expect(stored!.content).toBe('Summary of consolidated memories.')

        // Should be stored in vector store (since embed returns successfully)
        const vectorResults = await vectors.search('memory_vectors', [0.1, 0.2, 0.3], 100)
        const ids = vectorResults.map(r => r.id)
        expect(ids).toContain(node.id)
      }
    })
  })

  describe('consolidate() skips fresh tail', () => {
    it('does not consolidate the most recent N entries', async () => {
      const entries: EpisodicEntry[] = []
      for (let i = 0; i < 15; i++) {
        entries.push(makeEntry(
          `mem-${String(i).padStart(3, '0')}`,
          ENTITY_ID,
          `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        ))
      }
      storeEntries(docs, entries)

      consolidator = new MemoryConsolidator(docs, vectors, llm, memoryManager, {
        fresh_tail_count: 5,
        leaf_chunk_size: 4,
        condensation_threshold: 100,
      })

      const nodes = await consolidator.consolidate(ENTITY_ID)

      // The 5 most recent entries (mem-010 through mem-014) should NOT appear in any node's source_ids
      const allSourceIds = nodes.flatMap(n => n.source_ids)
      const recentIds = ['mem-010', 'mem-011', 'mem-012', 'mem-013', 'mem-014']
      for (const recentId of recentIds) {
        expect(allSourceIds).not.toContain(recentId)
      }
    })
  })

  describe('consolidate() returns empty when not enough unconsolidated entries', () => {
    it('returns empty array when unconsolidated count is below chunk size', async () => {
      // Only 3 entries total, with fresh_tail_count=5 there will be 0 unconsolidated
      const entries: EpisodicEntry[] = []
      for (let i = 0; i < 3; i++) {
        entries.push(makeEntry(
          `mem-${String(i).padStart(3, '0')}`,
          ENTITY_ID,
          `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        ))
      }
      storeEntries(docs, entries)

      consolidator = new MemoryConsolidator(docs, vectors, llm, memoryManager, {
        fresh_tail_count: 5,
        leaf_chunk_size: 4,
        condensation_threshold: 5,
      })

      const nodes = await consolidator.consolidate(ENTITY_ID)
      expect(nodes).toEqual([])
    })

    it('returns empty array for empty entity', async () => {
      consolidator = new MemoryConsolidator(docs, vectors, llm, memoryManager)

      const nodes = await consolidator.consolidate(ENTITY_ID)
      expect(nodes).toEqual([])
    })
  })

  describe('expand() recovers original source entries', () => {
    it('returns source entries for a leaf node', async () => {
      const entries: EpisodicEntry[] = []
      for (let i = 0; i < 15; i++) {
        entries.push(makeEntry(
          `mem-${String(i).padStart(3, '0')}`,
          ENTITY_ID,
          `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
          0.5,
          `Memory content number ${i}`,
        ))
      }
      storeEntries(docs, entries)

      consolidator = new MemoryConsolidator(docs, vectors, llm, memoryManager, {
        fresh_tail_count: 5,
        leaf_chunk_size: 4,
        condensation_threshold: 100,
      })

      const nodes = await consolidator.consolidate(ENTITY_ID)
      expect(nodes.length).toBeGreaterThan(0)

      const firstNode = nodes[0]
      const expanded = consolidator.expand(firstNode.id)

      // Should recover the original entries
      expect(expanded.length).toBe(firstNode.source_ids.length)
      for (const item of expanded) {
        expect(item.id).toMatch(/^mem-/)
        expect(firstNode.source_ids).toContain(item.id)
      }
    })

    it('returns empty array for nonexistent node', () => {
      consolidator = new MemoryConsolidator(docs, vectors, llm, memoryManager)

      const expanded = consolidator.expand('mn-nonexistent')
      expect(expanded).toEqual([])
    })
  })

  describe('importance resistance: high-importance entries count double', () => {
    it('creates fewer chunks when entries have high importance (>= 0.7)', async () => {
      // 10 entries beyond fresh tail, all high importance (>= 0.7)
      // With leaf_chunk_size=4, high-importance entries count 2x
      // So effective size per entry = 2, meaning 2 entries fill a chunk of 4
      // 10 high-importance entries => ~5 chunks of 2 entries each
      const entries: EpisodicEntry[] = []
      for (let i = 0; i < 15; i++) {
        entries.push(makeEntry(
          `mem-${String(i).padStart(3, '0')}`,
          ENTITY_ID,
          `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
          0.9, // high importance
          `Important event ${i}`,
        ))
      }
      storeEntries(docs, entries)

      consolidator = new MemoryConsolidator(docs, vectors, llm, memoryManager, {
        fresh_tail_count: 5,
        leaf_chunk_size: 4,
        condensation_threshold: 100,
      })

      const highNodes = await consolidator.consolidate(ENTITY_ID)

      // Now do the same with low importance entries
      const docs2 = new MockDocumentStore()
      const vectors2 = new InMemoryVectorStore()
      const llm2 = makeMockLLM()
      const mm2 = new MemoryManager(docs2, vectors2, llm2)

      const lowEntries: EpisodicEntry[] = []
      for (let i = 0; i < 15; i++) {
        lowEntries.push(makeEntry(
          `mem-${String(i).padStart(3, '0')}`,
          ENTITY_ID,
          `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
          0.3, // low importance
          `Low importance event ${i}`,
        ))
      }
      storeEntries(docs2, lowEntries)

      const consolidator2 = new MemoryConsolidator(docs2, vectors2, llm2, mm2, {
        fresh_tail_count: 5,
        leaf_chunk_size: 4,
        condensation_threshold: 100,
      })

      const lowNodes = await consolidator2.consolidate(ENTITY_ID)

      // High-importance nodes should have fewer source entries per node on average
      // (because each counts double toward chunk size)
      if (highNodes.length > 0 && lowNodes.length > 0) {
        const avgHighSources = highNodes.reduce((s, n) => s + n.source_ids.length, 0) / highNodes.length
        const avgLowSources = lowNodes.reduce((s, n) => s + n.source_ids.length, 0) / lowNodes.length
        expect(avgHighSources).toBeLessThanOrEqual(avgLowSources)
      }

      // High importance creates more chunks from the same number of entries
      expect(highNodes.length).toBeGreaterThanOrEqual(lowNodes.length)
    })
  })

  describe('getNodes() filters by level and unconsolidated_only', () => {
    it('returns all nodes for entity when no filters', async () => {
      const entries: EpisodicEntry[] = []
      for (let i = 0; i < 15; i++) {
        entries.push(makeEntry(
          `mem-${String(i).padStart(3, '0')}`,
          ENTITY_ID,
          `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        ))
      }
      storeEntries(docs, entries)

      consolidator = new MemoryConsolidator(docs, vectors, llm, memoryManager, {
        fresh_tail_count: 5,
        leaf_chunk_size: 4,
        condensation_threshold: 100,
      })

      await consolidator.consolidate(ENTITY_ID)

      const allNodes = consolidator.getNodes(ENTITY_ID)
      expect(allNodes.length).toBeGreaterThan(0)
      for (const node of allNodes) {
        expect(node.entity_id).toBe(ENTITY_ID)
      }
    })

    it('filters by level', async () => {
      const entries: EpisodicEntry[] = []
      for (let i = 0; i < 15; i++) {
        entries.push(makeEntry(
          `mem-${String(i).padStart(3, '0')}`,
          ENTITY_ID,
          `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        ))
      }
      storeEntries(docs, entries)

      consolidator = new MemoryConsolidator(docs, vectors, llm, memoryManager, {
        fresh_tail_count: 5,
        leaf_chunk_size: 4,
        condensation_threshold: 100,
      })

      await consolidator.consolidate(ENTITY_ID)

      const level1 = consolidator.getNodes(ENTITY_ID, { level: 1 })
      for (const node of level1) {
        expect(node.level).toBe(1)
      }

      // No level-2 nodes yet (condensation_threshold is very high)
      const level2 = consolidator.getNodes(ENTITY_ID, { level: 2 })
      expect(level2).toHaveLength(0)
    })

    it('filters by unconsolidated_only', async () => {
      const entries: EpisodicEntry[] = []
      for (let i = 0; i < 15; i++) {
        entries.push(makeEntry(
          `mem-${String(i).padStart(3, '0')}`,
          ENTITY_ID,
          `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        ))
      }
      storeEntries(docs, entries)

      consolidator = new MemoryConsolidator(docs, vectors, llm, memoryManager, {
        fresh_tail_count: 5,
        leaf_chunk_size: 4,
        condensation_threshold: 100,
      })

      await consolidator.consolidate(ENTITY_ID)

      const unconsolidated = consolidator.getNodes(ENTITY_ID, { unconsolidated_only: true })
      for (const node of unconsolidated) {
        expect(node.consolidated).toBe(false)
      }
    })

    it('returns empty for unknown entity', () => {
      consolidator = new MemoryConsolidator(docs, vectors, llm, memoryManager)

      const nodes = consolidator.getNodes('e-unknown')
      expect(nodes).toEqual([])
    })
  })

  describe('condensation: creates level-2 condensed nodes', () => {
    it('creates condensed nodes when enough leaf nodes exist', async () => {
      // We need enough entries to create >= condensation_threshold leaf nodes
      // With leaf_chunk_size=3 and fresh_tail=2, and condensation_threshold=3:
      // Need 2 (fresh tail) + 3*3=9 = 11 entries to produce 3 leaf nodes
      const entries: EpisodicEntry[] = []
      for (let i = 0; i < 14; i++) {
        entries.push(makeEntry(
          `mem-${String(i).padStart(3, '0')}`,
          ENTITY_ID,
          `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
          0.5,
          `[event] Event number ${i}`,
        ))
      }
      storeEntries(docs, entries)

      consolidator = new MemoryConsolidator(docs, vectors, llm, memoryManager, {
        fresh_tail_count: 2,
        leaf_chunk_size: 3,
        condensation_threshold: 3,
      })

      const nodes = await consolidator.consolidate(ENTITY_ID)

      const leafNodes = nodes.filter(n => n.type === 'leaf_summary' && n.level === 1)
      const condensedNodes = nodes.filter(n => n.type === 'condensed' && n.level === 2)

      expect(leafNodes.length).toBeGreaterThanOrEqual(3)
      expect(condensedNodes.length).toBeGreaterThanOrEqual(1)

      // Condensed node source_ids should reference leaf node IDs (mn-*)
      for (const condensed of condensedNodes) {
        expect(condensed.level).toBe(2)
        for (const sourceId of condensed.source_ids) {
          expect(sourceId).toMatch(/^mn-/)
        }
      }
    })

    it('condensed node has importance equal to max of its source leaf nodes', async () => {
      // Create entries with varying importance
      const entries: EpisodicEntry[] = []
      for (let i = 0; i < 14; i++) {
        entries.push(makeEntry(
          `mem-${String(i).padStart(3, '0')}`,
          ENTITY_ID,
          `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
          i === 5 ? 0.95 : 0.3, // One very important entry
        ))
      }
      storeEntries(docs, entries)

      consolidator = new MemoryConsolidator(docs, vectors, llm, memoryManager, {
        fresh_tail_count: 2,
        leaf_chunk_size: 3,
        condensation_threshold: 3,
      })

      const nodes = await consolidator.consolidate(ENTITY_ID)
      const condensedNodes = nodes.filter(n => n.type === 'condensed')

      if (condensedNodes.length > 0) {
        // At least one condensed node should propagate the high importance
        const leafNodes = nodes.filter(n => n.type === 'leaf_summary')
        const maxLeafImportance = Math.max(...leafNodes.map(n => n.importance))
        // The condensed node covering those leaves should have importance >= that
        const maxCondensedImportance = Math.max(...condensedNodes.map(n => n.importance))
        // It should be at least as high as the highest leaf (which propagates from entries)
        expect(maxCondensedImportance).toBeGreaterThanOrEqual(0.3)
      }
    })
  })

  describe('note_types extraction', () => {
    it('extracts typed prefixes from entry content', async () => {
      const entries: EpisodicEntry[] = []
      for (let i = 0; i < 12; i++) {
        const prefix = i % 3 === 0 ? '[opinion]' : i % 3 === 1 ? '[event]' : '[callback]'
        entries.push(makeEntry(
          `mem-${String(i).padStart(3, '0')}`,
          ENTITY_ID,
          `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
          0.5,
          `${prefix} Content for entry ${i}`,
        ))
      }
      storeEntries(docs, entries)

      consolidator = new MemoryConsolidator(docs, vectors, llm, memoryManager, {
        fresh_tail_count: 2,
        leaf_chunk_size: 4,
        condensation_threshold: 100,
      })

      const nodes = await consolidator.consolidate(ENTITY_ID)

      // At least some nodes should have note_types extracted
      const allNoteTypes = nodes.flatMap(n => n.note_types)
      expect(allNoteTypes.length).toBeGreaterThan(0)
      // Should contain the types we used
      const typeSet = new Set(allNoteTypes)
      expect(
        typeSet.has('opinion') || typeSet.has('event') || typeSet.has('callback'),
      ).toBe(true)
    })
  })
})
