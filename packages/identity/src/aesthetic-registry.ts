import { v4 as uuid } from 'uuid'
import type { IDocumentStore } from '../../storage/src/index.js'
import type { Aesthetic } from '../../schema/src/index.js'
import { AestheticSchema } from '../../schema/src/index.js'

const COLLECTION = 'aesthetics'

export class AestheticRegistry {
  constructor(private docs: IDocumentStore) {}

  create(entityId: string, input?: Partial<Omit<Aesthetic, 'id' | 'entity_id' | 'created_at'>>): Aesthetic {
    const now = new Date().toISOString()
    const aesthetic: Aesthetic = AestheticSchema.parse({
      id: `ae-${uuid()}`,
      entity_id: entityId,
      color_palette: input?.color_palette ?? [],
      visual_motifs: input?.visual_motifs ?? [],
      typography_style: input?.typography_style ?? null,
      created_at: now,
    })
    this.docs.put(COLLECTION, aesthetic.id, aesthetic)
    return aesthetic
  }

  getByEntity(entityId: string): Aesthetic | null {
    const all = this.docs.list(COLLECTION, { entity_id: entityId })
    return all.length > 0 ? AestheticSchema.parse(all[0]) : null
  }

  // Invariant 1: Aesthetic is required for entity completeness.
  // Returns existing or creates default.
  getOrCreateDefault(entityId: string): Aesthetic {
    const existing = this.getByEntity(entityId)
    if (existing) return existing
    return this.create(entityId)
  }
}
