import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DriftTracker } from '../drift-tracker.js'
import { DriftEngine } from '../drift-engine.js'
import { EpochManager } from '../epoch-manager.js'
import { TraitEngine } from '../../../identity/src/trait-engine.js'
import { MockDocumentStore } from '../../../__test-utils__/mock-store.js'

describe('DriftTracker', () => {
  let store: MockDocumentStore
  let tracker: DriftTracker

  const baseEvent = {
    entity_id: 'e-test',
    trait_name: 'confidence',
    old_value: 0.5,
    new_value: 0.55,
    delta: 0.05,
    rule_id: 'drift-rule-1',
    epoch_id: null,
  }

  beforeEach(() => {
    store = new MockDocumentStore()
    tracker = new DriftTracker(store)
  })

  describe('record()', () => {
    it('stores a drift event with generated id and timestamp', () => {
      const event = tracker.record(baseEvent)

      expect(event.id).toMatch(/^de-/)
      expect(event.entity_id).toBe('e-test')
      expect(event.trait_name).toBe('confidence')
      expect(event.old_value).toBe(0.5)
      expect(event.new_value).toBe(0.55)
      expect(event.delta).toBe(0.05)
      expect(event.rule_id).toBe('drift-rule-1')
      expect(event.epoch_id).toBeNull()
      expect(event.timestamp).toBeDefined()
    })

    it('stores events retrievable from store', () => {
      tracker.record(baseEvent)
      tracker.record({ ...baseEvent, old_value: 0.55, new_value: 0.6, delta: 0.05 })

      const events = tracker.getHistory('e-test', 'confidence')
      expect(events).toHaveLength(2)
    })
  })

  describe('getHistory()', () => {
    it('retrieves events sorted by timestamp descending', () => {
      // Insert events with controlled timestamps
      const e1 = tracker.record(baseEvent)
      const e2 = tracker.record({ ...baseEvent, old_value: 0.55, new_value: 0.6, delta: 0.05 })

      const history = tracker.getHistory('e-test', 'confidence')
      expect(history).toHaveLength(2)
      // Most recent first
      expect(history[0].timestamp >= history[1].timestamp).toBe(true)
    })

    it('filters by after timestamp', () => {
      const e1 = tracker.record(baseEvent)
      // Manually backdate e1
      store.put('drift_events', e1.id, { ...e1, timestamp: '2025-01-01T00:00:00.000Z' })

      const e2 = tracker.record({ ...baseEvent, old_value: 0.55, new_value: 0.6, delta: 0.05 })
      store.put('drift_events', e2.id, { ...e2, timestamp: '2025-06-01T00:00:00.000Z' })

      const filtered = tracker.getHistory('e-test', 'confidence', { after: '2025-03-01T00:00:00.000Z' })
      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe(e2.id)
    })

    it('filters by before timestamp', () => {
      const e1 = tracker.record(baseEvent)
      store.put('drift_events', e1.id, { ...e1, timestamp: '2025-01-01T00:00:00.000Z' })

      const e2 = tracker.record({ ...baseEvent, old_value: 0.55, new_value: 0.6, delta: 0.05 })
      store.put('drift_events', e2.id, { ...e2, timestamp: '2025-06-01T00:00:00.000Z' })

      const filtered = tracker.getHistory('e-test', 'confidence', { before: '2025-03-01T00:00:00.000Z' })
      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe(e1.id)
    })

    it('respects limit', () => {
      for (let i = 0; i < 10; i++) {
        tracker.record({ ...baseEvent, delta: 0.01 * i })
      }

      const limited = tracker.getHistory('e-test', 'confidence', { limit: 3 })
      expect(limited).toHaveLength(3)
    })

    it('does not mix entities or traits', () => {
      tracker.record(baseEvent)
      tracker.record({ ...baseEvent, entity_id: 'e-other' })
      tracker.record({ ...baseEvent, trait_name: 'patience' })

      const history = tracker.getHistory('e-test', 'confidence')
      expect(history).toHaveLength(1)
    })
  })

  describe('getValueAt()', () => {
    it('returns the value at a given timestamp', () => {
      const e1 = tracker.record(baseEvent)
      store.put('drift_events', e1.id, { ...e1, timestamp: '2025-01-01T00:00:00.000Z' })

      const e2 = tracker.record({ ...baseEvent, old_value: 0.55, new_value: 0.7, delta: 0.15 })
      store.put('drift_events', e2.id, { ...e2, timestamp: '2025-06-01T00:00:00.000Z' })

      // Query between the two events -- should get e1's new_value
      const value = tracker.getValueAt('e-test', 'confidence', '2025-03-01T00:00:00.000Z')
      expect(value).toBe(0.55)
    })

    it('returns the latest value when timestamp is after all events', () => {
      const e1 = tracker.record(baseEvent)
      store.put('drift_events', e1.id, { ...e1, timestamp: '2025-01-01T00:00:00.000Z' })

      const value = tracker.getValueAt('e-test', 'confidence', '2026-01-01T00:00:00.000Z')
      expect(value).toBe(0.55)
    })

    it('returns null when no events exist before timestamp', () => {
      const e1 = tracker.record(baseEvent)
      store.put('drift_events', e1.id, { ...e1, timestamp: '2025-06-01T00:00:00.000Z' })

      const value = tracker.getValueAt('e-test', 'confidence', '2025-01-01T00:00:00.000Z')
      expect(value).toBeNull()
    })
  })

  describe('getVelocity()', () => {
    it('returns stable with zero velocity when no events', () => {
      const result = tracker.getVelocity('e-test', 'confidence')
      expect(result.velocity).toBe(0)
      expect(result.direction).toBe('stable')
      expect(result.samples).toBe(0)
    })

    it('calculates rising velocity correctly', () => {
      const now = new Date()
      const twoHoursAgo = new Date(now.getTime() - 2 * 3600 * 1000).toISOString()
      const oneHourAgo = new Date(now.getTime() - 1 * 3600 * 1000).toISOString()

      const e1 = tracker.record({ ...baseEvent, delta: 0.1 })
      store.put('drift_events', e1.id, { ...e1, timestamp: twoHoursAgo })

      const e2 = tracker.record({ ...baseEvent, delta: 0.1 })
      store.put('drift_events', e2.id, { ...e2, timestamp: oneHourAgo })

      const result = tracker.getVelocity('e-test', 'confidence', 24)
      expect(result.velocity).toBeCloseTo(0.2, 1) // 0.2 total delta / 1 hour span
      expect(result.direction).toBe('rising')
      expect(result.samples).toBe(2)
    })

    it('calculates falling velocity correctly', () => {
      const now = new Date()
      const twoHoursAgo = new Date(now.getTime() - 2 * 3600 * 1000).toISOString()
      const oneHourAgo = new Date(now.getTime() - 1 * 3600 * 1000).toISOString()

      const e1 = tracker.record({ ...baseEvent, delta: -0.1 })
      store.put('drift_events', e1.id, { ...e1, timestamp: twoHoursAgo })

      const e2 = tracker.record({ ...baseEvent, delta: -0.05 })
      store.put('drift_events', e2.id, { ...e2, timestamp: oneHourAgo })

      const result = tracker.getVelocity('e-test', 'confidence', 24)
      expect(result.velocity).toBeCloseTo(-0.15, 1)
      expect(result.direction).toBe('falling')
      expect(result.samples).toBe(2)
    })

    it('excludes events outside the time window', () => {
      const now = new Date()
      const longAgo = new Date(now.getTime() - 500 * 3600 * 1000).toISOString()
      const recent = new Date(now.getTime() - 1 * 3600 * 1000).toISOString()

      const e1 = tracker.record({ ...baseEvent, delta: 0.3 })
      store.put('drift_events', e1.id, { ...e1, timestamp: longAgo })

      const e2 = tracker.record({ ...baseEvent, delta: 0.05 })
      store.put('drift_events', e2.id, { ...e2, timestamp: recent })

      // Window of 24 hours should only include e2
      const result = tracker.getVelocity('e-test', 'confidence', 24)
      expect(result.samples).toBe(1)
    })
  })

  describe('getTrajectory()', () => {
    it('returns empty array when no events', () => {
      const result = tracker.getTrajectory('e-test', 'confidence')
      expect(result).toEqual([])
    })

    it('returns all events when fewer than requested points', () => {
      tracker.record({ ...baseEvent, new_value: 0.5 })
      tracker.record({ ...baseEvent, new_value: 0.6 })

      const result = tracker.getTrajectory('e-test', 'confidence', 20)
      expect(result).toHaveLength(2)
    })

    it('returns evenly-sampled points when more events than requested', () => {
      // Create 10 events
      for (let i = 0; i < 10; i++) {
        const e = tracker.record({ ...baseEvent, new_value: 0.5 + i * 0.05 })
        const ts = new Date(2025, 0, 1 + i).toISOString()
        store.put('drift_events', e.id, { ...e, timestamp: ts })
      }

      const result = tracker.getTrajectory('e-test', 'confidence', 5)
      expect(result).toHaveLength(5)
      // First and last should match first and last events
      expect(result[0].value).toBe(0.5)
      expect(result[4].value).toBe(0.95)
    })
  })

  describe('Integration: DriftEngine + DriftTracker', () => {
    it('applyAll() records events when tracker is present', () => {
      const traitEngine = new TraitEngine(store)
      const epochManager = new EpochManager(store)
      const driftEngine = new DriftEngine(store, traitEngine, tracker, epochManager)

      // Create an entity trait
      traitEngine.create({
        entity_id: 'e-test',
        name: 'confidence',
        value: 0.5,
        range: { min: 0, max: 1 },
      })

      // Create a drift rule with no period constraint (last_applied = null, period_hours = 1)
      driftEngine.create({
        entity_id: 'e-test',
        trait_name: 'confidence',
        rate: 0.1,
        period_hours: 1,
        direction: { type: 'TowardValue', target: 1.0, bias: null },
        bounds: { min: 0, max: 1 },
      })

      const results = driftEngine.applyAll('e-test')
      expect(results).toHaveLength(1)
      expect(results[0].trait_name).toBe('confidence')

      // Verify drift event was recorded
      const history = tracker.getHistory('e-test', 'confidence')
      expect(history).toHaveLength(1)
      expect(history[0].old_value).toBe(0.5)
      expect(history[0].new_value).toBe(results[0].new_value)
      expect(history[0].delta).toBe(results[0].new_value - 0.5)
      expect(history[0].rule_id).toMatch(/^drift-/)
      expect(history[0].epoch_id).toBeNull()
    })

    it('applyAll() records epoch_id when epoch is active', () => {
      const traitEngine = new TraitEngine(store)
      const epochManager = new EpochManager(store)
      const driftEngine = new DriftEngine(store, traitEngine, tracker, epochManager)

      traitEngine.create({
        entity_id: 'e-test',
        name: 'confidence',
        value: 0.5,
        range: { min: 0, max: 1 },
      })

      // Create and activate an epoch
      const epoch = epochManager.create({ entity_id: 'e-test', name: 'Era One' })
      epochManager.activate(epoch.id)

      driftEngine.create({
        entity_id: 'e-test',
        trait_name: 'confidence',
        rate: 0.1,
        period_hours: 1,
        direction: { type: 'TowardValue', target: 1.0, bias: null },
        bounds: { min: 0, max: 1 },
      })

      driftEngine.applyAll('e-test')

      const history = tracker.getHistory('e-test', 'confidence')
      expect(history).toHaveLength(1)
      expect(history[0].epoch_id).toBe(epoch.id)
    })

    it('applyAll() does not record when tracker is absent', () => {
      const traitEngine = new TraitEngine(store)
      const driftEngineNoTracker = new DriftEngine(store, traitEngine)

      traitEngine.create({
        entity_id: 'e-test',
        name: 'confidence',
        value: 0.5,
        range: { min: 0, max: 1 },
      })

      driftEngineNoTracker.create({
        entity_id: 'e-test',
        trait_name: 'confidence',
        rate: 0.1,
        period_hours: 1,
        direction: { type: 'TowardValue', target: 1.0, bias: null },
        bounds: { min: 0, max: 1 },
      })

      const results = driftEngineNoTracker.applyAll('e-test')
      expect(results).toHaveLength(1)

      // No events recorded since no tracker
      const events = store.list('drift_events', { entity_id: 'e-test' })
      expect(events).toHaveLength(0)
    })
  })
})
