import { v4 as uuid } from 'uuid'
import type { IDocumentStore } from '../../storage/src/index.js'
import type { Epoch } from '../../schema/src/index.js'
import { EpochSchema } from '../../schema/src/index.js'

const COLLECTION = 'epochs'

export class EpochManager {
  constructor(private docs: IDocumentStore) {}

  create(input: {
    entity_id: string
    name: string
    ordinal?: number
    identity_core_version?: string
    trait_ranges?: Record<string, { min: number; max: number }>
    characteristic_mood?: string | null
    start_condition?: string
    end_condition?: string
  }): Epoch {
    const now = new Date().toISOString()

    // Auto-compute ordinal if not provided
    const existingEpochs = this.list(input.entity_id)
    const ordinal = input.ordinal ?? existingEpochs.length

    const epoch: Epoch = EpochSchema.parse({
      id: `epoch-${uuid()}`,
      entity_id: input.entity_id,
      name: input.name,
      ordinal,
      status: 'Planned',
      identity_core_version: input.identity_core_version ?? '1.0.0',
      trait_ranges: input.trait_ranges ?? {},
      characteristic_mood: input.characteristic_mood ?? null,
      start_condition: input.start_condition ?? '',
      end_condition: input.end_condition ?? '',
      started_at: null,
      ended_at: null,
      arcs_completed: [],
      created_at: now,
    })

    this.docs.put(COLLECTION, epoch.id, epoch)
    return epoch
  }

  get(id: string): Epoch | null {
    const doc = this.docs.get(COLLECTION, id)
    return doc ? EpochSchema.parse(doc) : null
  }

  list(entityId: string): Epoch[] {
    return this.docs
      .list(COLLECTION, { entity_id: entityId })
      .map(d => EpochSchema.parse(d))
      .sort((a, b) => a.ordinal - b.ordinal)
  }

  getActive(entityId: string): Epoch | null {
    const epochs = this.list(entityId)
    return epochs.find(e => e.status === 'Active') ?? null
  }

  activate(id: string): Epoch {
    const epoch = this.get(id)
    if (!epoch) {
      throw new Error(`Epoch not found: ${id}`)
    }
    if (epoch.status !== 'Planned') {
      throw new Error(`Cannot activate epoch with status '${epoch.status}'; must be 'Planned'`)
    }

    // Ensure no other epoch is active for this entity
    const active = this.getActive(epoch.entity_id)
    if (active) {
      throw new Error(
        `Entity '${epoch.entity_id}' already has an active epoch '${active.id}'. ` +
        `Complete or transition from it first.`,
      )
    }

    const now = new Date().toISOString()
    const activated: Epoch = EpochSchema.parse({
      ...epoch,
      status: 'Active',
      started_at: now,
    })

    this.docs.put(COLLECTION, activated.id, activated)
    return activated
  }

  complete(id: string): Epoch {
    const epoch = this.get(id)
    if (!epoch) {
      throw new Error(`Epoch not found: ${id}`)
    }
    if (epoch.status !== 'Active') {
      throw new Error(`Cannot complete epoch with status '${epoch.status}'; must be 'Active'`)
    }

    const now = new Date().toISOString()
    const completed: Epoch = EpochSchema.parse({
      ...epoch,
      status: 'Completed',
      ended_at: now,
    })

    this.docs.put(COLLECTION, completed.id, completed)
    return completed
  }

  transition(currentEpochId: string, nextEpochId: string): { completed: Epoch; activated: Epoch } {
    const current = this.get(currentEpochId)
    if (!current) {
      throw new Error(`Current epoch not found: ${currentEpochId}`)
    }
    if (current.status !== 'Active') {
      throw new Error(`Current epoch must be 'Active' to transition; got '${current.status}'`)
    }

    const next = this.get(nextEpochId)
    if (!next) {
      throw new Error(`Next epoch not found: ${nextEpochId}`)
    }
    if (next.status !== 'Planned') {
      throw new Error(`Next epoch must be 'Planned' to transition into; got '${next.status}'`)
    }
    if (next.entity_id !== current.entity_id) {
      throw new Error(`Cannot transition between epochs of different entities`)
    }

    // Complete current
    const now = new Date().toISOString()
    const completed: Epoch = EpochSchema.parse({
      ...current,
      status: 'Completed',
      ended_at: now,
    })
    this.docs.put(COLLECTION, completed.id, completed)

    // Activate next
    const activated: Epoch = EpochSchema.parse({
      ...next,
      status: 'Active',
      started_at: now,
    })
    this.docs.put(COLLECTION, activated.id, activated)

    return { completed, activated }
  }

  recordArcCompletion(entityId: string, arcId: string): Epoch | null {
    const active = this.getActive(entityId)
    if (!active) return null

    const updated: Epoch = EpochSchema.parse({
      ...active,
      arcs_completed: [...active.arcs_completed, arcId],
    })

    this.docs.put(COLLECTION, updated.id, updated)
    return updated
  }
}
