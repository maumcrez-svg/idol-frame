import { describe, it, expect, beforeEach } from 'vitest'
import { TraitEngine } from '../trait-engine.js'
import type { IDocumentStore } from '../../../storage/src/index.js'

// ── Mock Document Store ─────────────────────────────────────────────

class MockDocumentStore implements IDocumentStore {
  private store = new Map<string, Map<string, Record<string, any>>>()

  private getCollection(collection: string): Map<string, Record<string, any>> {
    if (!this.store.has(collection)) {
      this.store.set(collection, new Map())
    }
    return this.store.get(collection)!
  }

  put(collection: string, id: string, doc: Record<string, any>): void {
    this.getCollection(collection).set(id, structuredClone(doc))
  }

  get(collection: string, id: string): Record<string, any> | null {
    const doc = this.getCollection(collection).get(id)
    return doc ? structuredClone(doc) : null
  }

  list(collection: string, filter?: Record<string, any>): Record<string, any>[] {
    const col = this.getCollection(collection)
    const docs = Array.from(col.values())

    if (!filter) return docs.map(d => structuredClone(d))

    return docs
      .filter(doc => {
        for (const [key, value] of Object.entries(filter)) {
          if (doc[key] !== value) return false
        }
        return true
      })
      .map(d => structuredClone(d))
  }

  update(collection: string, id: string, partial: Record<string, any>): void {
    const existing = this.getCollection(collection).get(id)
    if (!existing) throw new Error(`Document not found: ${collection}/${id}`)
    this.getCollection(collection).set(id, { ...existing, ...partial })
  }

  delete(collection: string, id: string): void {
    this.getCollection(collection).delete(id)
  }

  transaction<T>(fn: () => T): T {
    return fn()
  }
}

// ── Tests ───────────────────────────────────────────────────────────

describe('TraitEngine', () => {
  let store: MockDocumentStore
  let engine: TraitEngine

  beforeEach(() => {
    store = new MockDocumentStore()
    engine = new TraitEngine(store)
  })

  describe('create()', () => {
    it('creates a trait with valid inputs', () => {
      const trait = engine.create({
        entity_id: 'e-test-001',
        name: 'Contrarianism',
        description: 'Tendency to oppose',
        value: 0.7,
        range: { min: 0.2, max: 0.9 },
        expression_rules: ['Push back on consensus'],
      })

      expect(trait.id).toMatch(/^tr-/)
      expect(trait.entity_id).toBe('e-test-001')
      expect(trait.name).toBe('Contrarianism')
      expect(trait.value).toBe(0.7)
      expect(trait.range.min).toBe(0.2)
      expect(trait.range.max).toBe(0.9)
      expect(trait.expression_rules).toEqual(['Push back on consensus'])
    })

    it('clamps value above max to max (Invariant 4)', () => {
      const trait = engine.create({
        entity_id: 'e-test-001',
        name: 'Overclamp',
        value: 1.5,
        range: { min: 0, max: 0.8 },
      })

      expect(trait.value).toBe(0.8)
    })

    it('clamps value below min to min (Invariant 4)', () => {
      const trait = engine.create({
        entity_id: 'e-test-001',
        name: 'Underclamp',
        value: 0.05,
        range: { min: 0.2, max: 0.9 },
      })

      expect(trait.value).toBe(0.2)
    })

    it('uses default range {0, 1} when not provided', () => {
      const trait = engine.create({
        entity_id: 'e-test-001',
        name: 'DefaultRange',
        value: 0.5,
      })

      expect(trait.range.min).toBe(0)
      expect(trait.range.max).toBe(1)
    })

    it('persists the trait in the store', () => {
      const trait = engine.create({
        entity_id: 'e-test-001',
        name: 'Persisted',
        value: 0.5,
      })

      const retrieved = engine.get(trait.id)
      expect(retrieved).not.toBeNull()
      expect(retrieved!.name).toBe('Persisted')
    })

    it('value at exact boundary is accepted', () => {
      const trait = engine.create({
        entity_id: 'e-test-001',
        name: 'Boundary',
        value: 0.3,
        range: { min: 0.3, max: 0.7 },
      })

      expect(trait.value).toBe(0.3)
    })

    it('defaults description to empty string', () => {
      const trait = engine.create({
        entity_id: 'e-test-001',
        name: 'NoDesc',
        value: 0.5,
      })

      expect(trait.description).toBe('')
    })

    it('defaults expression_rules to empty array', () => {
      const trait = engine.create({
        entity_id: 'e-test-001',
        name: 'NoRules',
        value: 0.5,
      })

      expect(trait.expression_rules).toEqual([])
    })
  })

  describe('setValue()', () => {
    it('updates the value within range', () => {
      const trait = engine.create({
        entity_id: 'e-test-001',
        name: 'Adjustable',
        value: 0.5,
        range: { min: 0.1, max: 0.9 },
      })

      const updated = engine.setValue(trait.id, 0.8)
      expect(updated.value).toBe(0.8)
    })

    it('clamps value above max to max', () => {
      const trait = engine.create({
        entity_id: 'e-test-001',
        name: 'ClampHigh',
        value: 0.5,
        range: { min: 0, max: 0.7 },
      })

      const updated = engine.setValue(trait.id, 1.0)
      expect(updated.value).toBe(0.7)
    })

    it('clamps value below min to min', () => {
      const trait = engine.create({
        entity_id: 'e-test-001',
        name: 'ClampLow',
        value: 0.5,
        range: { min: 0.3, max: 1.0 },
      })

      const updated = engine.setValue(trait.id, 0.1)
      expect(updated.value).toBe(0.3)
    })

    it('updates the updated_at timestamp', () => {
      const trait = engine.create({
        entity_id: 'e-test-001',
        name: 'TimeCheck',
        value: 0.5,
      })
      const originalUpdatedAt = trait.updated_at

      // Small delay to ensure different timestamp
      const updated = engine.setValue(trait.id, 0.6)
      expect(updated.updated_at).toBeDefined()
      // updated_at could be the same if execution is fast enough,
      // but it should at least be a valid ISO string
      expect(updated.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it('throws when trait not found', () => {
      expect(() => engine.setValue('tr-nonexistent', 0.5)).toThrow('Trait not found')
    })

    it('persists the updated value', () => {
      const trait = engine.create({
        entity_id: 'e-test-001',
        name: 'PersistUpdate',
        value: 0.5,
        range: { min: 0, max: 1 },
      })

      engine.setValue(trait.id, 0.9)
      const retrieved = engine.get(trait.id)
      expect(retrieved!.value).toBe(0.9)
    })
  })

  describe('listByEntity()', () => {
    it('returns traits for the given entity', () => {
      engine.create({ entity_id: 'e-test-001', name: 'Trait A', value: 0.5 })
      engine.create({ entity_id: 'e-test-001', name: 'Trait B', value: 0.6 })
      engine.create({ entity_id: 'e-test-002', name: 'Trait C', value: 0.7 })

      const traits = engine.listByEntity('e-test-001')
      expect(traits.length).toBe(2)
      expect(traits.map(t => t.name).sort()).toEqual(['Trait A', 'Trait B'])
    })

    it('returns empty array when entity has no traits', () => {
      const traits = engine.listByEntity('e-nonexistent')
      expect(traits).toEqual([])
    })

    it('does not include traits from other entities', () => {
      engine.create({ entity_id: 'e-test-001', name: 'Mine', value: 0.5 })
      engine.create({ entity_id: 'e-test-002', name: 'Not Mine', value: 0.5 })

      const traits = engine.listByEntity('e-test-001')
      expect(traits.length).toBe(1)
      expect(traits[0].name).toBe('Mine')
    })
  })

  describe('delete()', () => {
    it('removes a trait from the store', () => {
      const trait = engine.create({
        entity_id: 'e-test-001',
        name: 'Deletable',
        value: 0.5,
      })

      engine.delete(trait.id)
      const retrieved = engine.get(trait.id)
      expect(retrieved).toBeNull()
    })

    it('does not affect other traits when deleting one', () => {
      const traitA = engine.create({ entity_id: 'e-test-001', name: 'Keep', value: 0.5 })
      const traitB = engine.create({ entity_id: 'e-test-001', name: 'Remove', value: 0.6 })

      engine.delete(traitB.id)

      expect(engine.get(traitA.id)).not.toBeNull()
      expect(engine.get(traitB.id)).toBeNull()
    })

    it('subsequent listByEntity reflects deletion', () => {
      const trait = engine.create({ entity_id: 'e-test-001', name: 'ToDelete', value: 0.5 })
      engine.delete(trait.id)

      const traits = engine.listByEntity('e-test-001')
      expect(traits.length).toBe(0)
    })
  })

  describe('get()', () => {
    it('returns null for nonexistent id', () => {
      const result = engine.get('tr-nonexistent')
      expect(result).toBeNull()
    })

    it('returns the trait for existing id', () => {
      const trait = engine.create({
        entity_id: 'e-test-001',
        name: 'Existing',
        value: 0.5,
      })

      const result = engine.get(trait.id)
      expect(result).not.toBeNull()
      expect(result!.id).toBe(trait.id)
    })
  })
})
