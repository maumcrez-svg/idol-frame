import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EpochManager } from '../../../state/src/epoch-manager.js'
import { MockDocumentStore } from '../../../__test-utils__/mock-store.js'

describe('EpochManager', () => {
  let store: MockDocumentStore
  let manager: EpochManager

  beforeEach(() => {
    store = new MockDocumentStore()
    manager = new EpochManager(store)
  })

  describe('create()', () => {
    it('creates an epoch in Planned status', () => {
      const epoch = manager.create({
        entity_id: 'e-test',
        name: 'Genesis',
      })

      expect(epoch.id).toMatch(/^epoch-/)
      expect(epoch.entity_id).toBe('e-test')
      expect(epoch.name).toBe('Genesis')
      expect(epoch.status).toBe('Planned')
      expect(epoch.ordinal).toBe(0)
    })

    it('auto-increments ordinal', () => {
      manager.create({
        entity_id: 'e-test',
        name: 'Genesis',
      })

      const second = manager.create({
        entity_id: 'e-test',
        name: 'Awakening',
      })

      expect(second.status).toBe('Planned')
      expect(second.started_at).toBeNull()
      expect(second.ordinal).toBe(1)
    })
  })

  describe('getActive()', () => {
    it('returns active epoch', () => {
      const epoch = manager.create({
        entity_id: 'e-test',
        name: 'Genesis',
      })

      const activated = manager.activate(epoch.id)

      const active = manager.getActive('e-test')
      expect(active).not.toBeNull()
      expect(active!.id).toBe(epoch.id)
      expect(active!.status).toBe('Active')
    })

    it('returns null when none active', () => {
      const result = manager.getActive('e-test')
      expect(result).toBeNull()
    })
  })

  describe('transition()', () => {
    it('completes current epoch and activates next', () => {
      const first = manager.create({
        entity_id: 'e-test',
        name: 'Genesis',
      })
      manager.activate(first.id)

      const second = manager.create({
        entity_id: 'e-test',
        name: 'Awakening',
      })

      const result = manager.transition(first.id, second.id)

      expect(result.completed.id).toBe(first.id)
      expect(result.completed.status).toBe('Completed')
      expect(result.completed.ended_at).not.toBeNull()

      expect(result.activated.id).toBe(second.id)
      expect(result.activated.status).toBe('Active')
      expect(result.activated.started_at).not.toBeNull()
    })

    it('fails if target epoch does not exist', () => {
      const first = manager.create({
        entity_id: 'e-test',
        name: 'Genesis',
      })
      manager.activate(first.id)

      expect(() => {
        manager.transition(first.id, 'epoch-nonexistent')
      }).toThrow(/not found/)
    })
  })

  describe('recordArcCompletion()', () => {
    it('adds arc id to arcs_completed', () => {
      const epoch = manager.create({
        entity_id: 'e-test',
        name: 'Genesis',
      })
      manager.activate(epoch.id)

      const updated = manager.recordArcCompletion('e-test', 'arc-growth-001')
      expect(updated!.arcs_completed).toContain('arc-growth-001')

      // Add another arc
      const updated2 = manager.recordArcCompletion('e-test', 'arc-growth-002')
      expect(updated2!.arcs_completed).toContain('arc-growth-001')
      expect(updated2!.arcs_completed).toContain('arc-growth-002')
    })

    it('returns null when no active epoch', () => {
      const result = manager.recordArcCompletion('e-test', 'arc-growth-001')
      expect(result).toBeNull()
    })
  })

  describe('Invariant 3', () => {
    it('only one active epoch at a time', () => {
      const first = manager.create({
        entity_id: 'e-test',
        name: 'Genesis',
      })
      manager.activate(first.id)

      const second = manager.create({
        entity_id: 'e-test',
        name: 'Awakening',
      })
      expect(second.status).toBe('Planned')

      // Verify only one is active
      const allEpochs = manager.list('e-test')
      const activeCount = allEpochs.filter(e => e.status === 'Active').length
      expect(activeCount).toBe(1)

      // After transition, still only one active
      manager.transition(first.id, second.id)
      const allAfter = manager.list('e-test')
      const activeAfter = allAfter.filter(e => e.status === 'Active').length
      expect(activeAfter).toBe(1)
    })
  })
})
