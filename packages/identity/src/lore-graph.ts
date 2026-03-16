import { v4 as uuid } from 'uuid'
import type { IDocumentStore } from '../../storage/src/index.js'
import type { Lore, LoreCategory } from '../../schema/src/index.js'
import { LoreSchema } from '../../schema/src/index.js'

const COLLECTION = 'lore'

export class LoreGraph {
  constructor(private docs: IDocumentStore) {}

  add(input: {
    entity_id: string
    category: LoreCategory
    content: string
    supersedes?: string
  }): Lore {
    // Invariant 10: if supersedes is set, mark old lore as not approved
    if (input.supersedes) {
      const old = this.get(input.supersedes)
      if (old) {
        this.docs.update(COLLECTION, old.id, { ...old, approved: false })
      }
    }

    const now = new Date().toISOString()
    const lore: Lore = LoreSchema.parse({
      id: `lr-${uuid()}`,
      entity_id: input.entity_id,
      category: input.category,
      content: input.content,
      source: 'CreatorDefined',
      approved: true,
      supersedes: input.supersedes ?? null,
      created_at: now,
    })
    this.docs.put(COLLECTION, lore.id, lore)
    return lore
  }

  get(id: string): Lore | null {
    const doc = this.docs.get(COLLECTION, id)
    return doc ? LoreSchema.parse(doc) : null
  }

  listByEntity(entityId: string, onlyApproved = true): Lore[] {
    const all = this.docs.list(COLLECTION, { entity_id: entityId })
    const parsed = all.map(d => LoreSchema.parse(d))
    return onlyApproved ? parsed.filter(l => l.approved) : parsed
  }

  listByCategory(entityId: string, category: LoreCategory): Lore[] {
    return this.listByEntity(entityId).filter(l => l.category === category)
  }

  // Invariant 10: heuristic contradiction check (LLM-based semantic check planned)
  checkConsistency(entityId: string, newContent: string): { consistent: boolean; conflicts: Lore[] } {
    const existing = this.listByEntity(entityId)
    const conflicts: Lore[] = []

    for (const lore of existing) {
      // Simple heuristic: flag if new content directly negates existing
      const lowerNew = newContent.toLowerCase()
      const lowerExisting = lore.content.toLowerCase()

      const negations = ['not', 'never', 'doesn\'t', 'isn\'t', 'wasn\'t', 'won\'t', 'can\'t']
      for (const neg of negations) {
        if (lowerNew.includes(neg) && lowerExisting.includes(lowerNew.replace(new RegExp(`\\b${neg}\\b`, 'g'), '').trim().substring(0, 30))) {
          conflicts.push(lore)
          break
        }
      }
    }

    return { consistent: conflicts.length === 0, conflicts }
  }

  revoke(id: string): void {
    const existing = this.get(id)
    if (existing) {
      this.docs.update(COLLECTION, id, { ...existing, approved: false })
    }
  }
}
