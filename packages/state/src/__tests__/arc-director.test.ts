import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ArcDirector } from '../arc-director.js'
import { MockDocumentStore } from '../../../__test-utils__/mock-store.js'

const makePhase = (name: string) => ({
  name,
  description: `Phase: ${name}`,
  target_traits: {},
  mood_tendency: null,
  new_directives: [],
  transition: {
    type: 'CreatorManual' as const,
    condition: 'manual trigger',
    evaluator: 'manual',
    auto_advance: false,
  },
  duration_estimate_days: 7,
})

describe('ArcDirector', () => {
  let store: MockDocumentStore
  let director: ArcDirector
  let mockSnapshotManager: any

  beforeEach(() => {
    store = new MockDocumentStore()
    mockSnapshotManager = {
      capture: vi.fn().mockReturnValue({
        id: 'snap-test',
        entity_id: 'e-test',
        version: '1.0.0',
        label: '',
        state: {},
        checksum: 'abc',
        created_at: new Date().toISOString(),
      }),
      restore: vi.fn(),
    }
    director = new ArcDirector(store, mockSnapshotManager)
  })

  describe('create()', () => {
    it('creates arc with status Planned', () => {
      const arc = director.create({
        entity_id: 'e-test',
        name: 'Growth Arc',
        phases: [makePhase('Phase 1'), makePhase('Phase 2')],
      })

      expect(arc.id).toMatch(/^arc-/)
      expect(arc.entity_id).toBe('e-test')
      expect(arc.name).toBe('Growth Arc')
      expect(arc.status).toBe('Planned')
      expect(arc.phases).toHaveLength(2)
      expect(arc.current_phase).toBe(0)
      expect(arc.pre_arc_snapshot_id).toBeNull()
      expect(arc.started_at).toBeNull()
      expect(arc.completed_at).toBeNull()
    })
  })

  describe('activate()', () => {
    it('changes status to Active, sets started_at, takes pre-arc snapshot', () => {
      const arc = director.create({
        entity_id: 'e-test',
        name: 'Growth Arc',
        phases: [makePhase('Phase 1')],
      })

      const activated = director.activate(arc.id)

      expect(activated.status).toBe('Active')
      expect(activated.started_at).not.toBeNull()
      expect(activated.pre_arc_snapshot_id).toBe('snap-test')
      expect(mockSnapshotManager.capture).toHaveBeenCalledWith('e-test', 'pre-arc: Growth Arc')
    })

    it('fails if another arc already active (Invariant 2)', () => {
      const arc1 = director.create({
        entity_id: 'e-test',
        name: 'Arc 1',
        phases: [makePhase('P1')],
      })
      director.activate(arc1.id)

      const arc2 = director.create({
        entity_id: 'e-test',
        name: 'Arc 2',
        phases: [makePhase('P1')],
      })

      expect(() => director.activate(arc2.id)).toThrow(/Invariant 2/)
    })
  })

  describe('getActive()', () => {
    it('returns active arc', () => {
      const arc = director.create({
        entity_id: 'e-test',
        name: 'Active Arc',
        phases: [makePhase('P1')],
      })
      director.activate(arc.id)

      const active = director.getActive('e-test')
      expect(active).not.toBeNull()
      expect(active!.id).toBe(arc.id)
      expect(active!.status).toBe('Active')
    })

    it('returns null if none active', () => {
      const result = director.getActive('e-test')
      expect(result).toBeNull()
    })
  })

  describe('getCurrentPhase()', () => {
    it('returns current phase object', () => {
      const arc = director.create({
        entity_id: 'e-test',
        name: 'Phased Arc',
        phases: [makePhase('Intro'), makePhase('Climax'), makePhase('Resolution')],
      })
      director.activate(arc.id)

      const result = director.getCurrentPhase('e-test')
      expect(result).not.toBeNull()
      expect(result!.phase.name).toBe('Intro')
      expect(result!.index).toBe(0)
    })
  })

  describe('advancePhase()', () => {
    it('increments current_phase', () => {
      const arc = director.create({
        entity_id: 'e-test',
        name: 'Multi-Phase',
        phases: [makePhase('P1'), makePhase('P2'), makePhase('P3')],
      })
      director.activate(arc.id)

      const advanced = director.advancePhase(arc.id)
      expect(advanced.current_phase).toBe(1)
      expect(advanced.status).toBe('Active')
    })

    it('on last phase completes the arc', () => {
      const arc = director.create({
        entity_id: 'e-test',
        name: 'Short Arc',
        phases: [makePhase('Only Phase')],
      })
      director.activate(arc.id)

      const completed = director.advancePhase(arc.id)
      expect(completed.status).toBe('Completed')
      expect(completed.completed_at).not.toBeNull()
    })
  })

  describe('abort()', () => {
    it('sets status to Aborted', () => {
      const arc = director.create({
        entity_id: 'e-test',
        name: 'Abort Test',
        phases: [makePhase('P1')],
      })
      director.activate(arc.id)

      const aborted = director.abort(arc.id)
      expect(aborted.status).toBe('Aborted')
      expect(aborted.completed_at).not.toBeNull()
    })

    it('with AutoOnAbort policy calls snapshotManager.restore()', () => {
      const arc = director.create({
        entity_id: 'e-test',
        name: 'Rollback Arc',
        phases: [makePhase('P1')],
        rollback_policy: 'AutoOnAbort',
      })
      director.activate(arc.id)

      director.abort(arc.id)

      expect(mockSnapshotManager.restore).toHaveBeenCalledWith('snap-test')
    })
  })

  describe('complete()', () => {
    it('sets status to Completed, sets completed_at', () => {
      const arc = director.create({
        entity_id: 'e-test',
        name: 'Complete Test',
        phases: [makePhase('P1')],
      })
      director.activate(arc.id)

      const completed = director.complete(arc.id)
      expect(completed.status).toBe('Completed')
      expect(completed.completed_at).not.toBeNull()
      expect(completed.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })
  })

  describe('list()', () => {
    it('returns all arcs for entity', () => {
      director.create({
        entity_id: 'e-test',
        name: 'Arc A',
        phases: [makePhase('P1')],
      })
      director.create({
        entity_id: 'e-test',
        name: 'Arc B',
        phases: [makePhase('P1')],
      })
      director.create({
        entity_id: 'e-other',
        name: 'Arc C',
        phases: [makePhase('P1')],
      })

      const arcs = director.list('e-test')
      expect(arcs).toHaveLength(2)
      expect(arcs.map(a => a.name).sort()).toEqual(['Arc A', 'Arc B'])
    })
  })
})
