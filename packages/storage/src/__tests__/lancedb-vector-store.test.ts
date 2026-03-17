import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { LanceDBVectorStore } from '../vector-store.js'

function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0))
  return norm === 0 ? v : v.map((x) => x / norm)
}

describe('LanceDBVectorStore', () => {
  let store: LanceDBVectorStore
  let tempDir: string
  const tempDirs: string[] = []

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'lancedb-test-'))
    tempDirs.push(dir)
    return dir
  }

  beforeEach(() => {
    tempDir = makeTempDir()
    store = new LanceDBVectorStore(tempDir)
  })

  afterAll(() => {
    for (const dir of tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // best-effort cleanup
      }
    }
  })

  describe('upsert and search', () => {
    it('inserts a vector and retrieves it by similarity', async () => {
      const vec = normalize([1, 0, 0, 0])
      await store.upsert('test', 'doc-1', vec, { label: 'first' })

      const results = await store.search('test', vec, 5)

      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('doc-1')
      expect(results[0].score).toBeGreaterThan(0.9)
      expect(results[0].metadata.label).toBe('first')
    })

    it('returns results ordered by cosine similarity', async () => {
      const query = normalize([1, 0, 0, 0])
      const close = normalize([0.9, 0.1, 0, 0])
      const far = normalize([0, 0, 0, 1])

      await store.upsert('test', 'close', close, { type: 'close' })
      await store.upsert('test', 'far', far, { type: 'far' })

      const results = await store.search('test', query, 5)

      expect(results).toHaveLength(2)
      expect(results[0].id).toBe('close')
      expect(results[1].id).toBe('far')
      expect(results[0].score).toBeGreaterThan(results[1].score)
    })
  })

  describe('search with metadata filter', () => {
    it('filters results by metadata key-value pair', async () => {
      const vec = normalize([1, 0, 0, 0])

      await store.upsert('test', 'a', vec, { category: 'alpha' })
      await store.upsert('test', 'b', vec, { category: 'beta' })
      await store.upsert('test', 'c', vec, { category: 'alpha' })

      const results = await store.search('test', vec, 10, { category: 'alpha' })

      expect(results).toHaveLength(2)
      const ids = results.map((r) => r.id).sort()
      expect(ids).toEqual(['a', 'c'])
    })
  })

  describe('upsert replaces existing entry', () => {
    it('updates metadata when upserting same id', async () => {
      const vec = normalize([1, 0, 0, 0])

      await store.upsert('test', 'doc-1', vec, { version: 'v1' })
      await store.upsert('test', 'doc-1', vec, { version: 'v2' })

      const results = await store.search('test', vec, 10)

      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('doc-1')
      expect(results[0].metadata.version).toBe('v2')
    })

    it('updates the vector when upserting same id', async () => {
      const vecA = normalize([1, 0, 0, 0])
      const vecB = normalize([0, 1, 0, 0])

      await store.upsert('test', 'doc-1', vecA, { label: 'x' })
      await store.upsert('test', 'doc-1', vecB, { label: 'x' })

      const resultsA = await store.search('test', vecA, 10)
      const resultsB = await store.search('test', vecB, 10)

      // Should be closer to vecB now
      expect(resultsB[0].score).toBeGreaterThan(resultsA[0].score)
    })
  })

  describe('delete', () => {
    it('removes entry from search results', async () => {
      const vec = normalize([1, 0, 0, 0])

      await store.upsert('test', 'doc-1', vec, { label: 'a' })
      await store.upsert('test', 'doc-2', vec, { label: 'b' })

      await store.delete('test', 'doc-1')

      const results = await store.search('test', vec, 10)

      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('doc-2')
    })

    it('does not error when deleting from nonexistent collection', async () => {
      await expect(store.delete('nonexistent', 'doc-1')).resolves.not.toThrow()
    })
  })

  describe('collection isolation', () => {
    it('keeps data in separate collections independent', async () => {
      const vec = normalize([1, 0, 0, 0])

      await store.upsert('collection_a', 'doc-1', vec, { source: 'a' })
      await store.upsert('collection_b', 'doc-2', vec, { source: 'b' })

      const resultsA = await store.search('collection_a', vec, 10)
      const resultsB = await store.search('collection_b', vec, 10)

      expect(resultsA).toHaveLength(1)
      expect(resultsA[0].id).toBe('doc-1')
      expect(resultsA[0].metadata.source).toBe('a')

      expect(resultsB).toHaveLength(1)
      expect(resultsB[0].id).toBe('doc-2')
      expect(resultsB[0].metadata.source).toBe('b')
    })
  })

  describe('empty collection search', () => {
    it('returns empty array when collection does not exist', async () => {
      const results = await store.search('nonexistent', normalize([1, 0, 0, 0]), 10)
      expect(results).toEqual([])
    })
  })
})
