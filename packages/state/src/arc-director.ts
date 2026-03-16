import { v4 as uuid } from 'uuid'
import type { IDocumentStore } from '../../storage/src/index.js'
import type { Arc, ArcPhase } from '../../schema/src/index.js'
import { ArcSchema } from '../../schema/src/index.js'
import type { SnapshotManager } from '../../identity/src/snapshot-manager.js'

const COLLECTION = 'arcs'

export class ArcDirector {
  constructor(
    private docs: IDocumentStore,
    private snapshotManager: SnapshotManager,
  ) {}

  create(input: {
    entity_id: string
    name: string
    phases: ArcPhase[]
    rollback_policy?: 'AutoOnAbort' | 'ManualOnly' | 'NoRollback'
  }): Arc {
    const now = new Date().toISOString()

    const arc: Arc = ArcSchema.parse({
      id: `arc-${uuid()}`,
      entity_id: input.entity_id,
      name: input.name,
      status: 'Planned',
      phases: input.phases,
      current_phase: 0,
      pre_arc_snapshot_id: null,
      rollback_policy: input.rollback_policy ?? 'AutoOnAbort',
      created_at: now,
      started_at: null,
      completed_at: null,
    })

    this.docs.put(COLLECTION, arc.id, arc)
    return arc
  }

  activate(arcId: string): Arc {
    const arc = this.get(arcId)
    if (!arc) {
      throw new Error(`Arc not found: ${arcId}`)
    }
    if (arc.status !== 'Planned') {
      throw new Error(`Cannot activate arc with status '${arc.status}'; must be 'Planned'`)
    }

    // Invariant 2: Only one active Arc per entity
    const activeArc = this.getActive(arc.entity_id)
    if (activeArc) {
      throw new Error(
        `Invariant 2: Entity '${arc.entity_id}' already has an active arc '${activeArc.id}'. ` +
        `Only one active arc per entity is allowed.`,
      )
    }

    // Take pre-arc snapshot
    const snapshot = this.snapshotManager.capture(arc.entity_id, `pre-arc: ${arc.name}`)
    const now = new Date().toISOString()

    const activated: Arc = ArcSchema.parse({
      ...arc,
      status: 'Active',
      pre_arc_snapshot_id: snapshot.id,
      started_at: now,
    })

    this.docs.put(COLLECTION, activated.id, activated)
    return activated
  }

  getActive(entityId: string): Arc | null {
    const docs = this.docs.list(COLLECTION, { entity_id: entityId })
    for (const doc of docs) {
      const arc: Arc = ArcSchema.parse(doc)
      if (arc.status === 'Active') return arc
    }
    return null
  }

  get(id: string): Arc | null {
    const doc = this.docs.get(COLLECTION, id)
    return doc ? ArcSchema.parse(doc) : null
  }

  list(entityId: string): Arc[] {
    return this.docs
      .list(COLLECTION, { entity_id: entityId })
      .map(d => ArcSchema.parse(d))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }

  getCurrentPhase(entityId: string): { arc: Arc; phase: ArcPhase; index: number } | null {
    const arc = this.getActive(entityId)
    if (!arc) return null

    const phase = arc.phases[arc.current_phase]
    if (!phase) return null

    return { arc, phase, index: arc.current_phase }
  }

  advancePhase(arcId: string): Arc {
    const arc = this.get(arcId)
    if (!arc) {
      throw new Error(`Arc not found: ${arcId}`)
    }
    if (arc.status !== 'Active') {
      throw new Error(`Cannot advance phase on arc with status '${arc.status}'; must be 'Active'`)
    }

    const nextPhaseIndex = arc.current_phase + 1

    // If last phase, complete the arc
    if (nextPhaseIndex >= arc.phases.length) {
      return this.complete(arcId)
    }

    const advanced: Arc = ArcSchema.parse({
      ...arc,
      current_phase: nextPhaseIndex,
    })

    this.docs.put(COLLECTION, advanced.id, advanced)
    return advanced
  }

  abort(arcId: string): Arc {
    const arc = this.get(arcId)
    if (!arc) {
      throw new Error(`Arc not found: ${arcId}`)
    }
    if (arc.status !== 'Active' && arc.status !== 'Planned') {
      throw new Error(`Cannot abort arc with status '${arc.status}'; must be 'Active' or 'Planned'`)
    }

    const now = new Date().toISOString()

    const aborted: Arc = ArcSchema.parse({
      ...arc,
      status: 'Aborted',
      completed_at: now,
    })

    this.docs.put(COLLECTION, aborted.id, aborted)

    // If rollback policy is AutoOnAbort and we have a snapshot, restore it
    if (aborted.rollback_policy === 'AutoOnAbort' && aborted.pre_arc_snapshot_id) {
      this.snapshotManager.restore(aborted.pre_arc_snapshot_id)
    }

    return aborted
  }

  complete(arcId: string): Arc {
    const arc = this.get(arcId)
    if (!arc) {
      throw new Error(`Arc not found: ${arcId}`)
    }
    if (arc.status !== 'Active') {
      throw new Error(`Cannot complete arc with status '${arc.status}'; must be 'Active'`)
    }

    const now = new Date().toISOString()

    const completed: Arc = ArcSchema.parse({
      ...arc,
      status: 'Completed',
      completed_at: now,
    })

    this.docs.put(COLLECTION, completed.id, completed)
    return completed
  }
}
