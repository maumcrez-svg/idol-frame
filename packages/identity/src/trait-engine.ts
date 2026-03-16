import { v4 as uuid } from 'uuid'
import type { IDocumentStore } from '../../storage/src/index.js'
import type { Trait } from '../../schema/src/index.js'
import { TraitSchema } from '../../schema/src/index.js'

const COLLECTION = 'traits'

export class TraitEngine {
  constructor(private docs: IDocumentStore) {}

  create(input: {
    entity_id: string
    name: string
    description?: string
    value: number
    range?: { min: number; max: number }
    expression_rules?: string[]
  }): Trait {
    const now = new Date().toISOString()
    const range = input.range ?? { min: 0, max: 1 }

    // Invariant 4: clamp value to range
    const clamped = Math.max(range.min, Math.min(range.max, input.value))

    const trait: Trait = TraitSchema.parse({
      id: `tr-${uuid()}`,
      entity_id: input.entity_id,
      name: input.name,
      description: input.description ?? '',
      value: clamped,
      range,
      expression_rules: input.expression_rules ?? [],
      created_at: now,
      updated_at: now,
    })
    this.docs.put(COLLECTION, trait.id, trait)
    return trait
  }

  listByEntity(entityId: string): Trait[] {
    return this.docs.list(COLLECTION, { entity_id: entityId }).map(d => TraitSchema.parse(d))
  }

  get(id: string): Trait | null {
    const doc = this.docs.get(COLLECTION, id)
    return doc ? TraitSchema.parse(doc) : null
  }

  // Invariant 4: value is always clamped to [min, max]
  setValue(id: string, newValue: number): Trait {
    const existing = this.get(id)
    if (!existing) throw new Error(`Trait not found: ${id}`)

    const clamped = Math.max(existing.range.min, Math.min(existing.range.max, newValue))

    const updated = TraitSchema.parse({
      ...existing,
      value: clamped,
      updated_at: new Date().toISOString(),
    })
    this.docs.put(COLLECTION, id, updated)
    return updated
  }

  update(id: string, partial: Partial<Pick<Trait, 'name' | 'description' | 'expression_rules'>>): Trait {
    const existing = this.get(id)
    if (!existing) throw new Error(`Trait not found: ${id}`)

    const updated = TraitSchema.parse({
      ...existing,
      ...partial,
      updated_at: new Date().toISOString(),
    })
    this.docs.put(COLLECTION, id, updated)
    return updated
  }

  // Returns traits with mood modulations applied (temporary, not persisted)
  listByEntityWithMoodMods(entityId: string, traitMods: Record<string, number>): Trait[] {
    const traits = this.listByEntity(entityId)
    return traits.map(t => {
      const mod = traitMods[t.name]
      if (mod === undefined || mod === 0) return t
      const modulated = Math.max(t.range.min, Math.min(t.range.max, t.value + mod))
      return { ...t, value: modulated }
    })
  }

  delete(id: string): void {
    this.docs.delete(COLLECTION, id)
  }
}
