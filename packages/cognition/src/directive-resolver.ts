import { v4 as uuid } from 'uuid'
import type { IDocumentStore } from '../../storage/src/index.js'
import type { Directive, Guardrail } from '../../schema/src/index.js'
import { DirectiveSchema } from '../../schema/src/index.js'

const COLLECTION = 'directives'

export class DirectiveResolver {
  constructor(private docs: IDocumentStore) {}

  create(
    input: {
      entity_id: string
      priority?: number
      scope: Directive['scope']
      instruction: string
      rationale?: string | null
      expiration: Directive['expiration']
      created_by?: string
    },
    guardrails: Guardrail[],
  ): Directive {
    // Invariant 12: check if instruction contradicts any Safety guardrail
    this.checkGuardrailConflicts(input.instruction, guardrails)

    const now = new Date().toISOString()

    const directive: Directive = DirectiveSchema.parse({
      id: `dir-${uuid()}`,
      entity_id: input.entity_id,
      priority: input.priority ?? 100,
      scope: input.scope,
      instruction: input.instruction,
      rationale: input.rationale ?? null,
      expiration: input.expiration,
      status: 'Active',
      created_at: now,
      created_by: input.created_by ?? 'creator',
      conflicts_with: [],
    })

    this.docs.put(COLLECTION, directive.id, directive)
    return directive
  }

  resolve(input: {
    entity_id: string
    stage_id?: string
    session_id?: string
  }): Directive[] {
    const allDocs = this.docs.list(COLLECTION, { entity_id: input.entity_id })
    const allDirectives = allDocs.map(d => DirectiveSchema.parse(d))

    // Step 1: filter to Active only
    let active = allDirectives.filter(d => d.status === 'Active')

    // Step 3: expire any ExpiresAt directives past their date
    const now = new Date()
    const expired: string[] = []
    active = active.filter(d => {
      if (d.expiration.type === 'ExpiresAt') {
        const expiresAt = new Date(d.expiration.date)
        if (now >= expiresAt) {
          // Mark as expired in store
          const updated = DirectiveSchema.parse({ ...d, status: 'Expired' })
          this.docs.put(COLLECTION, updated.id, updated)
          expired.push(d.id)
          return false
        }
      }
      return true
    })

    // Step 2: filter by scope
    active = active.filter(d => {
      switch (d.scope.type) {
        case 'Global':
          return true
        case 'Context':
          return input.stage_id !== undefined && d.scope.stage_id === input.stage_id
        case 'Session':
          return input.session_id !== undefined && d.scope.session_id === input.session_id
        default:
          return false
      }
    })

    // Step 4: sort by priority descending
    active.sort((a, b) => b.priority - a.priority)

    // Step 5 & 6: detect conflicts - extract key terms from instructions
    // Higher priority wins conflicts. We track which "topics" have been claimed.
    const resolvedTopics = new Map<string, string>() // topic -> directive id that claimed it
    const result: Directive[] = []
    const conflictIds: string[] = []

    for (const directive of active) {
      const topics = this.extractTopics(directive.instruction)
      let hasConflict = false

      for (const topic of topics) {
        const existingClaimId = resolvedTopics.get(topic)
        if (existingClaimId !== undefined) {
          // This directive conflicts with a higher-priority one; skip it
          hasConflict = true
          conflictIds.push(directive.id)
          break
        }
      }

      if (!hasConflict) {
        result.push(directive)
        for (const topic of topics) {
          resolvedTopics.set(topic, directive.id)
        }
      }
    }

    // Update conflicts_with on conflicting directives
    for (const id of conflictIds) {
      const doc = this.docs.get(COLLECTION, id)
      if (doc) {
        const d = DirectiveSchema.parse(doc)
        const winnerId = resolvedTopics.get(this.extractTopics(d.instruction)[0] ?? '')
        if (winnerId && !d.conflicts_with.includes(winnerId)) {
          const updated = DirectiveSchema.parse({
            ...d,
            conflicts_with: [...d.conflicts_with, winnerId],
          })
          this.docs.put(COLLECTION, updated.id, updated)
        }
      }
    }

    return result
  }

  get(id: string): Directive | null {
    const doc = this.docs.get(COLLECTION, id)
    return doc ? DirectiveSchema.parse(doc) : null
  }

  list(entityId: string, includeInactive?: boolean): Directive[] {
    const docs = this.docs.list(COLLECTION, { entity_id: entityId })
    const directives = docs.map(d => DirectiveSchema.parse(d))

    if (includeInactive) {
      return directives.sort((a, b) => b.priority - a.priority)
    }

    return directives
      .filter(d => d.status === 'Active')
      .sort((a, b) => b.priority - a.priority)
  }

  revoke(id: string): Directive {
    const directive = this.get(id)
    if (!directive) {
      throw new Error(`Directive not found: ${id}`)
    }
    if (directive.status === 'Revoked') {
      throw new Error(`Directive '${id}' is already revoked`)
    }

    const updated: Directive = DirectiveSchema.parse({
      ...directive,
      status: 'Revoked',
    })

    this.docs.put(COLLECTION, updated.id, updated)
    return updated
  }

  consumeSingleUse(id: string): void {
    const directive = this.get(id)
    if (!directive) {
      throw new Error(`Directive not found: ${id}`)
    }
    if (directive.expiration.type !== 'SingleUse') {
      throw new Error(`Directive '${id}' is not a SingleUse directive`)
    }
    if (directive.status !== 'Active') {
      throw new Error(`Directive '${id}' is not active; cannot consume`)
    }

    const updated: Directive = DirectiveSchema.parse({
      ...directive,
      status: 'Expired',
    })

    this.docs.put(COLLECTION, updated.id, updated)
  }

  /**
   * Invariant 12: check if instruction contradicts any Safety guardrail.
   * Heuristic: tokenize both instruction and guardrail condition into lowercase words,
   * flag conflict if significant overlap detected with a Safety guardrail.
   */
  private checkGuardrailConflicts(instruction: string, guardrails: Guardrail[]): void {
    const safetyGuardrails = guardrails.filter(g => g.category === 'Safety' && g.active)
    const instructionTerms = this.tokenize(instruction)

    for (const guardrail of safetyGuardrails) {
      const conditionTerms = this.tokenize(guardrail.condition)
      const overlap = conditionTerms.filter(term => instructionTerms.includes(term))

      // If more than half of the guardrail's significant terms appear in the instruction,
      // consider it a conflict
      const significantTerms = conditionTerms.filter(t => t.length > 3)
      const significantOverlap = significantTerms.filter(term => instructionTerms.includes(term))

      if (significantTerms.length > 0 && significantOverlap.length >= Math.ceil(significantTerms.length / 2)) {
        throw new Error(
          `Invariant 12: Directive instruction conflicts with Safety guardrail '${guardrail.name}' ` +
          `(id: ${guardrail.id}). Conflicting terms: [${significantOverlap.join(', ')}]`,
        )
      }
    }
  }

  /**
   * Extract topic keywords from an instruction for conflict detection.
   * Filters out common stop words and returns lowercased significant terms.
   */
  private extractTopics(instruction: string): string[] {
    return this.tokenize(instruction).filter(t => t.length > 3)
  }

  private tokenize(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'shall', 'can', 'need', 'must', 'ought',
      'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
      'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most',
      'other', 'some', 'such', 'than', 'too', 'very', 'just', 'that',
      'this', 'these', 'those', 'with', 'from', 'into', 'for', 'about',
    ])

    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 0 && !stopWords.has(word))
  }
}
