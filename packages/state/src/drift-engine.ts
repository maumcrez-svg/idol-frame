import { v4 as uuid } from 'uuid'
import type { IDocumentStore } from '../../storage/src/index.js'
import type { DriftRule, DriftDirection } from '../../schema/src/index.js'
import { DriftRuleSchema } from '../../schema/src/index.js'
import type { TraitEngine } from '../../identity/src/trait-engine.js'
import type { DriftTracker } from './drift-tracker.js'
import type { EpochManager } from './epoch-manager.js'

const COLLECTION = 'drift_rules'

export class DriftEngine {
  constructor(
    private docs: IDocumentStore,
    private traitEngine: TraitEngine,
    private tracker?: DriftTracker,
    private epochManager?: EpochManager,
  ) {}

  create(input: {
    entity_id: string
    trait_name: string
    rate: number
    period_hours?: number
    direction: DriftDirection
    triggers?: DriftRule['triggers']
    bounds: { min: number; max: number }
  }): DriftRule {
    const now = new Date().toISOString()

    const rule: DriftRule = DriftRuleSchema.parse({
      id: `drift-${uuid()}`,
      entity_id: input.entity_id,
      trait_name: input.trait_name,
      rate: input.rate,
      period_hours: input.period_hours ?? 168,
      direction: input.direction,
      triggers: input.triggers ?? [],
      bounds: input.bounds,
      is_active: true,
      last_applied: null,
      created_at: now,
    })

    this.docs.put(COLLECTION, rule.id, rule)
    return rule
  }

  get(id: string): DriftRule | null {
    const doc = this.docs.get(COLLECTION, id)
    return doc ? DriftRuleSchema.parse(doc) : null
  }

  list(entityId: string): DriftRule[] {
    return this.docs
      .list(COLLECTION, { entity_id: entityId })
      .map(d => DriftRuleSchema.parse(d))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }

  listActive(entityId: string): DriftRule[] {
    return this.list(entityId).filter(r => r.is_active)
  }

  deactivate(id: string): DriftRule {
    const rule = this.get(id)
    if (!rule) {
      throw new Error(`Drift rule not found: ${id}`)
    }

    const deactivated: DriftRule = DriftRuleSchema.parse({
      ...rule,
      is_active: false,
    })

    this.docs.put(COLLECTION, deactivated.id, deactivated)
    return deactivated
  }

  applyAll(entityId: string): Array<{ trait_name: string; old_value: number; new_value: number; rule_id: string }> {
    const rules = this.listActive(entityId)
    const results: Array<{ trait_name: string; old_value: number; new_value: number; rule_id: string }> = []
    const now = new Date()

    for (const rule of rules) {
      // Check if enough time has passed since last application
      if (rule.last_applied !== null) {
        const lastApplied = new Date(rule.last_applied)
        const hoursSinceLast = (now.getTime() - lastApplied.getTime()) / (1000 * 60 * 60)
        if (hoursSinceLast < rule.period_hours) {
          continue
        }
      }

      // Find the trait
      const traits = this.traitEngine.listByEntity(entityId)
      const trait = traits.find(t => t.name === rule.trait_name)
      if (!trait) continue

      const oldValue = trait.value
      const delta = this.computeDelta(rule, oldValue)
      // Invariant 4: clamp to both rule.bounds AND trait.range
      const effectiveMin = Math.max(rule.bounds.min, trait.range.min)
      const effectiveMax = Math.min(rule.bounds.max, trait.range.max)
      const newValue = Math.max(effectiveMin, Math.min(effectiveMax, oldValue + delta))

      if (newValue !== oldValue) {
        this.traitEngine.setValue(trait.id, newValue)
        results.push({
          trait_name: rule.trait_name,
          old_value: oldValue,
          new_value: newValue,
          rule_id: rule.id,
        })

        // Record drift event for cross-time tracking
        if (this.tracker) {
          const epochId = this.epochManager
            ? this.epochManager.getActive(entityId)?.id ?? null
            : null
          this.tracker.record({
            entity_id: entityId,
            trait_name: rule.trait_name,
            old_value: oldValue,
            new_value: newValue,
            delta: newValue - oldValue,
            rule_id: rule.id,
            epoch_id: epochId,
          })
        }
      }

      // Update last_applied
      const updated: DriftRule = DriftRuleSchema.parse({
        ...rule,
        last_applied: now.toISOString(),
      })
      this.docs.put(COLLECTION, updated.id, updated)
    }

    return results
  }

  private computeDelta(rule: DriftRule, currentValue: number): number {
    const direction = rule.direction

    switch (direction.type) {
      case 'TowardValue': {
        const target = direction.target ?? 0.5
        const diff = target - currentValue
        if (Math.abs(diff) < 0.001) return 0
        return Math.sign(diff) * Math.min(rule.rate, Math.abs(diff))
      }

      case 'TowardInteractions': {
        // Bias-based drift: drift in the direction of the bias
        const bias = direction.bias ?? 0
        return rule.rate * bias
      }

      case 'RandomWalk': {
        // Random walk within rate bounds
        const randomDirection = Math.random() > 0.5 ? 1 : -1
        const bias = direction.bias ?? 0
        return rule.rate * (randomDirection + bias) / 2
      }

      case 'Decay': {
        // Decay toward 0 by rate
        if (currentValue > 0) {
          return -Math.min(rule.rate, currentValue)
        }
        return 0
      }

      default:
        return 0
    }
  }
}
