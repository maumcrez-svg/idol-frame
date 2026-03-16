import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DriftEngine } from '../../../state/src/drift-engine.js'
import { TraitEngine } from '../../../identity/src/trait-engine.js'
import { MockDocumentStore } from '../../../__test-utils__/mock-store.js'

describe('DriftEngine', () => {
  let driftStore: MockDocumentStore
  let traitStore: MockDocumentStore
  let traitEngine: TraitEngine
  let engine: DriftEngine

  beforeEach(() => {
    driftStore = new MockDocumentStore()
    traitStore = new MockDocumentStore()
    traitEngine = new TraitEngine(traitStore)

    // Pre-populate a trait to drift
    traitEngine.create({
      entity_id: 'e-test',
      name: 'curiosity',
      value: 0.5,
      range: { min: 0, max: 1 },
    })

    engine = new DriftEngine(driftStore, traitEngine)
  })

  describe('create()', () => {
    it('creates a drift rule', () => {
      const rule = engine.create({
        entity_id: 'e-test',
        trait_name: 'curiosity',
        rate: 0.05,
        direction: { type: 'TowardValue', target: 0.8, bias: null },
        bounds: { min: 0.1, max: 0.9 },
      })

      expect(rule.id).toMatch(/^drift-/)
      expect(rule.entity_id).toBe('e-test')
      expect(rule.trait_name).toBe('curiosity')
      expect(rule.rate).toBe(0.05)
      expect(rule.direction.type).toBe('TowardValue')
      expect(rule.direction.target).toBe(0.8)
      expect(rule.bounds.min).toBe(0.1)
      expect(rule.bounds.max).toBe(0.9)
      expect(rule.is_active).toBe(true)
      expect(rule.last_applied).toBeNull()
    })
  })

  describe('list()', () => {
    it('returns rules for entity', () => {
      engine.create({
        entity_id: 'e-test',
        trait_name: 'curiosity',
        rate: 0.05,
        direction: { type: 'Decay', target: null, bias: null },
        bounds: { min: 0, max: 1 },
      })
      engine.create({
        entity_id: 'e-test',
        trait_name: 'curiosity',
        rate: 0.02,
        direction: { type: 'TowardValue', target: 0.3, bias: null },
        bounds: { min: 0, max: 1 },
      })
      engine.create({
        entity_id: 'e-other',
        trait_name: 'patience',
        rate: 0.01,
        direction: { type: 'Decay', target: null, bias: null },
        bounds: { min: 0, max: 1 },
      })

      const rules = engine.list('e-test')
      expect(rules).toHaveLength(2)
      expect(rules.every(r => r.entity_id === 'e-test')).toBe(true)
    })
  })

  describe('deactivate()', () => {
    it('sets is_active to false', () => {
      const rule = engine.create({
        entity_id: 'e-test',
        trait_name: 'curiosity',
        rate: 0.05,
        direction: { type: 'Decay', target: null, bias: null },
        bounds: { min: 0, max: 1 },
      })

      const deactivated = engine.deactivate(rule.id)
      expect(deactivated.is_active).toBe(false)

      const fetched = engine.get(rule.id)
      expect(fetched!.is_active).toBe(false)
    })
  })

  describe('applyAll()', () => {
    it('with TowardValue direction moves trait toward target', () => {
      engine.create({
        entity_id: 'e-test',
        trait_name: 'curiosity',
        rate: 0.1,
        period_hours: 1,
        direction: { type: 'TowardValue', target: 0.8, bias: null },
        bounds: { min: 0, max: 1 },
      })

      const changes = engine.applyAll('e-test')
      expect(changes).toHaveLength(1)
      expect(changes[0].trait_name).toBe('curiosity')
      expect(changes[0].old_value).toBe(0.5)
      expect(changes[0].new_value).toBe(0.6) // 0.5 + 0.1 toward 0.8
    })

    it('with Decay direction moves trait toward 0', () => {
      engine.create({
        entity_id: 'e-test',
        trait_name: 'curiosity',
        rate: 0.1,
        period_hours: 1,
        direction: { type: 'Decay', target: null, bias: null },
        bounds: { min: 0, max: 1 },
      })

      const changes = engine.applyAll('e-test')
      expect(changes).toHaveLength(1)
      expect(changes[0].old_value).toBe(0.5)
      expect(changes[0].new_value).toBe(0.4) // 0.5 - 0.1
    })

    it('respects rule bounds (never exceeds rule.bounds)', () => {
      // Trait value 0.5, try to push toward 1.0, but rule bounds cap at 0.6
      engine.create({
        entity_id: 'e-test',
        trait_name: 'curiosity',
        rate: 0.3,
        period_hours: 1,
        direction: { type: 'TowardValue', target: 1.0, bias: null },
        bounds: { min: 0.2, max: 0.6 },
      })

      const changes = engine.applyAll('e-test')
      expect(changes).toHaveLength(1)
      expect(changes[0].new_value).toBeLessThanOrEqual(0.6)
      expect(changes[0].new_value).toBeGreaterThanOrEqual(0.2)
    })

    it('respects trait range (Invariant 4)', () => {
      // Create a trait with restricted range
      traitEngine.create({
        entity_id: 'e-test',
        name: 'patience',
        value: 0.7,
        range: { min: 0.3, max: 0.8 },
      })

      // Rule tries to push beyond trait range
      engine.create({
        entity_id: 'e-test',
        trait_name: 'patience',
        rate: 0.5,
        period_hours: 1,
        direction: { type: 'TowardValue', target: 1.0, bias: null },
        bounds: { min: 0, max: 1 },
      })

      const changes = engine.applyAll('e-test')
      const patienceChange = changes.find(c => c.trait_name === 'patience')
      // Effective max = min(rule.bounds.max=1, trait.range.max=0.8) = 0.8
      expect(patienceChange).toBeDefined()
      expect(patienceChange!.new_value).toBeLessThanOrEqual(0.8)
    })

    it('does nothing if period has not elapsed since last_applied', () => {
      const rule = engine.create({
        entity_id: 'e-test',
        trait_name: 'curiosity',
        rate: 0.1,
        period_hours: 168, // 1 week
        direction: { type: 'TowardValue', target: 0.8, bias: null },
        bounds: { min: 0, max: 1 },
      })

      // First apply works
      const changes1 = engine.applyAll('e-test')
      expect(changes1).toHaveLength(1)

      // Second apply immediately after should skip (period not elapsed)
      const changes2 = engine.applyAll('e-test')
      expect(changes2).toHaveLength(0)
    })

    it('updates last_applied after application', () => {
      const rule = engine.create({
        entity_id: 'e-test',
        trait_name: 'curiosity',
        rate: 0.1,
        period_hours: 1,
        direction: { type: 'TowardValue', target: 0.8, bias: null },
        bounds: { min: 0, max: 1 },
      })

      expect(rule.last_applied).toBeNull()

      engine.applyAll('e-test')

      const updated = engine.get(rule.id)
      expect(updated!.last_applied).not.toBeNull()
      expect(updated!.last_applied).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it('skips inactive rules', () => {
      const rule = engine.create({
        entity_id: 'e-test',
        trait_name: 'curiosity',
        rate: 0.1,
        period_hours: 1,
        direction: { type: 'TowardValue', target: 0.8, bias: null },
        bounds: { min: 0, max: 1 },
      })

      engine.deactivate(rule.id)

      const changes = engine.applyAll('e-test')
      expect(changes).toHaveLength(0)
    })
  })
})
