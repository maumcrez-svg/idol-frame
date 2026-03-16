import { v4 as uuid } from 'uuid'
import type { IDocumentStore } from '../../storage/src/index.js'
import type { Entity } from '../../schema/src/index.js'
import { EntitySchema } from '../../schema/src/index.js'

const COLLECTION = 'entities'

export class EntityStore {
  constructor(private docs: IDocumentStore) {}

  create(input: { name: string; archetype: string; role: string; domain: string }): Entity {
    const now = new Date().toISOString()
    const entity: Entity = EntitySchema.parse({
      id: `e-${uuid()}`,
      version: '1.0.0',
      name: input.name,
      archetype: input.archetype,
      role: input.role,
      domain: input.domain,
      status: 'Active',
      created_at: now,
      updated_at: now,
    })
    this.docs.put(COLLECTION, entity.id, entity)
    // Store version history
    this.docs.put(`${COLLECTION}_versions`, `${entity.id}@${entity.version}`, entity)
    return entity
  }

  get(id: string): Entity | null {
    const doc = this.docs.get(COLLECTION, id)
    return doc ? EntitySchema.parse(doc) : null
  }

  getOrFail(id: string): Entity {
    const entity = this.get(id)
    if (!entity) throw new Error(`Entity not found: ${id}`)
    return entity
  }

  list(filter?: { status?: 'Active' | 'Archived' }): Entity[] {
    return this.docs.list(COLLECTION, filter).map(d => EntitySchema.parse(d))
  }

  update(id: string, partial: Partial<Pick<Entity, 'name' | 'archetype' | 'role' | 'domain'>>): Entity {
    const existing = this.getOrFail(id)
    if (existing.status === 'Archived') throw new Error(`Cannot update archived entity: ${id}`)

    const updated: Entity = EntitySchema.parse({
      ...existing,
      ...partial,
      updated_at: new Date().toISOString(),
    })
    this.docs.put(COLLECTION, id, updated)
    return updated
  }

  archive(id: string): Entity {
    const existing = this.getOrFail(id)
    const archived: Entity = EntitySchema.parse({
      ...existing,
      status: 'Archived',
      updated_at: new Date().toISOString(),
    })
    this.docs.put(COLLECTION, id, archived)
    return archived
  }

  bumpVersion(id: string, bump: 'major' | 'minor' | 'patch'): Entity {
    const existing = this.getOrFail(id)
    const [major, minor, patch] = existing.version.split('.').map(Number)
    let newVersion: string
    switch (bump) {
      case 'major': newVersion = `${major + 1}.0.0`; break
      case 'minor': newVersion = `${major}.${minor + 1}.0`; break
      case 'patch': newVersion = `${major}.${minor}.${patch + 1}`; break
    }

    const updated: Entity = EntitySchema.parse({
      ...existing,
      version: newVersion,
      updated_at: new Date().toISOString(),
    })
    this.docs.put(COLLECTION, id, updated)
    this.docs.put(`${COLLECTION}_versions`, `${id}@${newVersion}`, updated)
    return updated
  }

  getVersion(id: string, version: string): Entity | null {
    const doc = this.docs.get(`${COLLECTION}_versions`, `${id}@${version}`)
    return doc ? EntitySchema.parse(doc) : null
  }

  listVersions(id: string): Entity[] {
    return this.docs.list(`${COLLECTION}_versions`, { id }).map(d => EntitySchema.parse(d))
  }
}
