import { v4 as uuid } from 'uuid'
import type { IDocumentStore } from '../../storage/src/index.js'
import type { IdentityCore, ValueEntry, Tension } from '../../schema/src/index.js'
import { IdentityCoreSchema } from '../../schema/src/index.js'

const COLLECTION = 'identity_cores'

export class IdentityCoreManager {
  constructor(private docs: IDocumentStore) {}

  create(input: {
    entity_id: string
    values: ValueEntry[]
    worldview?: IdentityCore['worldview']
    core_tensions?: Tension[]
    recognition_markers?: string[]
  }): IdentityCore {
    const now = new Date().toISOString()
    const core: IdentityCore = IdentityCoreSchema.parse({
      id: `ic-${uuid()}`,
      entity_id: input.entity_id,
      version: '1.0.0',
      values: input.values,
      worldview: input.worldview ?? { beliefs: [], communication_philosophy: '' },
      core_tensions: input.core_tensions ?? [],
      recognition_markers: input.recognition_markers ?? [],
      created_at: now,
    })
    this.docs.put(COLLECTION, core.id, core)
    this.docs.put(`${COLLECTION}_versions`, `${core.entity_id}@${core.version}`, core)
    return core
  }

  getByEntity(entityId: string): IdentityCore | null {
    const all = this.docs.list(COLLECTION, { entity_id: entityId })
    return all.length > 0 ? IdentityCoreSchema.parse(all[0]) : null
  }

  getByEntityOrFail(entityId: string): IdentityCore {
    const core = this.getByEntity(entityId)
    if (!core) throw new Error(`IdentityCore not found for entity: ${entityId}`)
    return core
  }

  get(id: string): IdentityCore | null {
    const doc = this.docs.get(COLLECTION, id)
    return doc ? IdentityCoreSchema.parse(doc) : null
  }

  // Invariant 7: IdentityCore is immutable after creation.
  // The only way to "change" it is to create a new version.
  createNewVersion(entityId: string, changes: {
    values?: ValueEntry[]
    worldview?: IdentityCore['worldview']
    core_tensions?: Tension[]
    recognition_markers?: string[]
  }): IdentityCore {
    const existing = this.getByEntityOrFail(entityId)
    const [major, minor, patch] = existing.version.split('.').map(Number)
    const newVersion = `${major}.${minor + 1}.${patch}`

    const now = new Date().toISOString()
    const newCore: IdentityCore = IdentityCoreSchema.parse({
      id: `ic-${uuid()}`,
      entity_id: entityId,
      version: newVersion,
      values: changes.values ?? existing.values,
      worldview: changes.worldview ?? existing.worldview,
      core_tensions: changes.core_tensions ?? existing.core_tensions,
      recognition_markers: changes.recognition_markers ?? existing.recognition_markers,
      created_at: now,
    })

    // Archive old, store new
    this.docs.delete(COLLECTION, existing.id)
    this.docs.put(COLLECTION, newCore.id, newCore)
    this.docs.put(`${COLLECTION}_versions`, `${entityId}@${newVersion}`, newCore)
    return newCore
  }
}
