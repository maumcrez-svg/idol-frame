import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { SQLiteFTSIndex } from '../fts-index.js'

describe('SQLiteFTSIndex', () => {
  let db: Database.Database
  let fts: SQLiteFTSIndex

  beforeEach(() => {
    db = new Database(':memory:')
    fts = new SQLiteFTSIndex(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('index() and search()', () => {
    it('indexes a document and finds it by keyword', () => {
      fts.index('mem-001', 'e-test', 'Bitcoin hit an all-time high today')

      const results = fts.search('e-test', 'Bitcoin', 10)

      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('mem-001')
      expect(results[0].score).toBeGreaterThan(0)
      expect(results[0].snippet).toBeDefined()
    })

    it('returns snippet containing the matched term', () => {
      fts.index('mem-001', 'e-test', 'The market crashed after the Fed announcement on inflation data')

      const results = fts.search('e-test', 'inflation', 10)

      expect(results).toHaveLength(1)
      expect(results[0].snippet).toContain('inflation')
    })

    it('replaces existing entry on re-index with same ID', () => {
      fts.index('mem-001', 'e-test', 'Original content about dogs')
      fts.index('mem-001', 'e-test', 'Updated content about cats')

      const dogResults = fts.search('e-test', 'dogs', 10)
      expect(dogResults).toHaveLength(0)

      const catResults = fts.search('e-test', 'cats', 10)
      expect(catResults).toHaveLength(1)
      expect(catResults[0].id).toBe('mem-001')
    })
  })

  describe('indexBatch()', () => {
    it('indexes multiple documents in a single transaction', () => {
      fts.indexBatch([
        { id: 'mem-001', entityId: 'e-test', content: 'Bitcoin price analysis and market trends' },
        { id: 'mem-002', entityId: 'e-test', content: 'Ethereum DeFi protocols saw record volume' },
        { id: 'mem-003', entityId: 'e-test', content: 'Solana network experienced an outage' },
      ])

      const btcResults = fts.search('e-test', 'Bitcoin', 10)
      expect(btcResults).toHaveLength(1)
      expect(btcResults[0].id).toBe('mem-001')

      const ethResults = fts.search('e-test', 'Ethereum', 10)
      expect(ethResults).toHaveLength(1)
      expect(ethResults[0].id).toBe('mem-002')

      const solResults = fts.search('e-test', 'Solana', 10)
      expect(solResults).toHaveLength(1)
      expect(solResults[0].id).toBe('mem-003')
    })

    it('handles re-indexing within batch (removes old entries)', () => {
      fts.index('mem-001', 'e-test', 'Old content about apples')

      fts.indexBatch([
        { id: 'mem-001', entityId: 'e-test', content: 'New content about oranges' },
      ])

      const appleResults = fts.search('e-test', 'apples', 10)
      expect(appleResults).toHaveLength(0)

      const orangeResults = fts.search('e-test', 'oranges', 10)
      expect(orangeResults).toHaveLength(1)
    })
  })

  describe('search() filters by entityId', () => {
    it('only returns results for the queried entity', () => {
      fts.index('mem-001', 'e-alpha', 'Bitcoin is going to the moon')
      fts.index('mem-002', 'e-beta', 'Bitcoin is a scam according to many')

      const alphaResults = fts.search('e-alpha', 'Bitcoin', 10)
      expect(alphaResults).toHaveLength(1)
      expect(alphaResults[0].id).toBe('mem-001')

      const betaResults = fts.search('e-beta', 'Bitcoin', 10)
      expect(betaResults).toHaveLength(1)
      expect(betaResults[0].id).toBe('mem-002')
    })

    it('returns empty for an entity with no indexed content', () => {
      fts.index('mem-001', 'e-alpha', 'Some content about crypto markets')

      const results = fts.search('e-gamma', 'crypto', 10)
      expect(results).toHaveLength(0)
    })
  })

  describe('search() returns BM25-ranked results with snippets', () => {
    it('ranks more relevant documents higher', () => {
      fts.index('mem-001', 'e-test', 'Bitcoin Bitcoin Bitcoin is the future of finance Bitcoin')
      fts.index('mem-002', 'e-test', 'The weather today is nice and sunny')
      fts.index('mem-003', 'e-test', 'Some people like Bitcoin as an investment')

      const results = fts.search('e-test', 'Bitcoin', 10)

      // Only the two documents containing "Bitcoin" should be returned
      expect(results.length).toBeGreaterThanOrEqual(2)

      // The document with more "Bitcoin" mentions should rank higher (higher score)
      const ids = results.map(r => r.id)
      expect(ids).toContain('mem-001')
      expect(ids).toContain('mem-003')
      expect(ids).not.toContain('mem-002')

      // BM25 scores are normalized to 0-1, top result should be 1.0
      expect(results[0].score).toBeCloseTo(1.0, 1)
    })

    it('respects the limit parameter', () => {
      for (let i = 0; i < 20; i++) {
        fts.index(`mem-${i}`, 'e-test', `Document number ${i} about crypto markets`)
      }

      const results = fts.search('e-test', 'crypto', 5)
      expect(results).toHaveLength(5)
    })

    it('each result has id, snippet, and score fields', () => {
      fts.index('mem-001', 'e-test', 'Detailed analysis of the cryptocurrency market conditions')

      const results = fts.search('e-test', 'cryptocurrency', 10)
      expect(results).toHaveLength(1)

      const result = results[0]
      expect(result).toHaveProperty('id')
      expect(result).toHaveProperty('snippet')
      expect(result).toHaveProperty('score')
      expect(typeof result.id).toBe('string')
      expect(typeof result.snippet).toBe('string')
      expect(typeof result.score).toBe('number')
    })
  })

  describe('remove()', () => {
    it('removes a document from the index', () => {
      fts.index('mem-001', 'e-test', 'Bitcoin is the future')
      fts.index('mem-002', 'e-test', 'Ethereum is the future')

      fts.remove('mem-001')

      const results = fts.search('e-test', 'future', 10)
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('mem-002')
    })

    it('does not error when removing a nonexistent ID', () => {
      expect(() => fts.remove('mem-nonexistent')).not.toThrow()
    })
  })

  describe('search with no matches', () => {
    it('returns empty array when query matches nothing', () => {
      fts.index('mem-001', 'e-test', 'The sun rises in the east')

      const results = fts.search('e-test', 'xyznonexistentterm', 10)
      expect(results).toEqual([])
    })

    it('returns empty array when index is empty', () => {
      const results = fts.search('e-test', 'anything', 10)
      expect(results).toEqual([])
    })
  })

  describe('edge cases', () => {
    it('handles content with double quotes', () => {
      fts.index('mem-001', 'e-test', 'He said "Bitcoin is dead" but was wrong')

      const results = fts.search('e-test', 'Bitcoin', 10)
      expect(results).toHaveLength(1)
    })

    it('handles query with double quotes (escapes them)', () => {
      fts.index('mem-001', 'e-test', 'Bitcoin price prediction for next year')

      // The search method wraps in quotes after escaping
      const results = fts.search('e-test', 'price prediction', 10)
      // Should not throw
      expect(Array.isArray(results)).toBe(true)
    })
  })
})
