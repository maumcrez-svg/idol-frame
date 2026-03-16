import { v4 as uuid } from 'uuid'
import { createHash } from 'crypto'
import type { IDocumentStore } from '../../storage/src/index.js'
import type { Snapshot } from '../../schema/src/index.js'
import { SnapshotSchema } from '../../schema/src/index.js'
import type { EntityStore } from './entity-store.js'
import type { IdentityCoreManager } from './identity-core-manager.js'
import type { VoiceRegistry } from './voice-registry.js'
import type { TraitEngine } from './trait-engine.js'
import type { LoreGraph } from './lore-graph.js'
import type { AestheticRegistry } from './aesthetic-registry.js'

const COLLECTION = 'snapshots'

export class SnapshotManager {
  constructor(
    private docs: IDocumentStore,
    private entityStore: EntityStore,
    private identityCoreManager: IdentityCoreManager,
    private voiceRegistry: VoiceRegistry,
    private traitEngine: TraitEngine,
    private loreGraph: LoreGraph,
    private aestheticRegistry: AestheticRegistry,
  ) {}

  capture(entityId: string, label?: string): Snapshot {
    const entity = this.entityStore.getOrFail(entityId)
    const identityCore = this.identityCoreManager.getByEntityOrFail(entityId)
    const voice = this.voiceRegistry.getByEntityOrFail(entityId)
    const traits = this.traitEngine.listByEntity(entityId)
    const guardrails = this.loadGuardrails(entityId)
    const lore = this.loreGraph.listByEntity(entityId, false)
    const aesthetic = this.aestheticRegistry.getByEntity(entityId)

    const state = {
      entity,
      identity_core: identityCore,
      voice,
      traits,
      guardrails,
      lore,
      aesthetic,
    }

    const checksum = createHash('sha256')
      .update(JSON.stringify(state))
      .digest('hex')

    const snapshot: Snapshot = SnapshotSchema.parse({
      id: `snap-${uuid()}`,
      entity_id: entityId,
      version: entity.version,
      label: label ?? `v${entity.version} snapshot`,
      state,
      checksum,
      created_at: new Date().toISOString(),
    })

    this.docs.put(COLLECTION, snapshot.id, snapshot)
    return snapshot
  }

  get(id: string): Snapshot | null {
    const doc = this.docs.get(COLLECTION, id)
    return doc ? SnapshotSchema.parse(doc) : null
  }

  getOrFail(id: string): Snapshot {
    const snap = this.get(id)
    if (!snap) throw new Error(`Snapshot not found: ${id}`)
    return snap
  }

  list(entityId: string): Snapshot[] {
    return this.docs
      .list(COLLECTION, { entity_id: entityId })
      .map(d => SnapshotSchema.parse(d))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }

  /** Invariant 10: verify checksum on restore, then write all state back to stores. */
  restore(snapshotId: string): void {
    const snapshot = this.getOrFail(snapshotId)
    const checksum = createHash('sha256')
      .update(JSON.stringify(snapshot.state))
      .digest('hex')

    if (checksum !== snapshot.checksum) {
      throw new Error(
        `Snapshot integrity check failed: expected ${snapshot.checksum}, got ${checksum}`,
      )
    }

    const { entity_id } = snapshot
    const { entity, identity_core, voice, traits, guardrails, lore, aesthetic } = snapshot.state

    this.docs.transaction(() => {
      // Restore entity
      this.docs.put('entities', entity_id, entity)

      // Restore identity core: delete existing, put snapshot version
      const existingCores = this.docs.list('identity_cores', { entity_id })
      for (const core of existingCores) {
        this.docs.delete('identity_cores', (core as Record<string, string>).id)
      }
      this.docs.put(
        'identity_cores',
        (identity_core as Record<string, string>).id,
        identity_core as Record<string, unknown>,
      )

      // Restore voice: delete existing, put snapshot version
      const existingVoices = this.docs.list('voices', { entity_id })
      for (const v of existingVoices) {
        this.docs.delete('voices', (v as Record<string, string>).id)
      }
      this.docs.put(
        'voices',
        (voice as Record<string, string>).id,
        voice as Record<string, unknown>,
      )

      // Restore traits: delete all existing for entity, replace with snapshot
      const existingTraits = this.docs.list('traits', { entity_id })
      for (const t of existingTraits) {
        this.docs.delete('traits', (t as Record<string, string>).id)
      }
      for (const trait of traits) {
        const t = trait as Record<string, string>
        this.docs.put('traits', t.id, trait as Record<string, unknown>)
      }

      // Restore guardrails: delete all existing for entity, replace with snapshot
      const existingGuardrails = this.docs.list('guardrails', { entity_id })
      for (const g of existingGuardrails) {
        this.docs.delete('guardrails', (g as Record<string, string>).id)
      }
      for (const guardrail of guardrails) {
        const g = guardrail as Record<string, string>
        this.docs.put('guardrails', g.id, guardrail as Record<string, unknown>)
      }

      // Restore lore: delete all existing for entity, replace with snapshot
      const existingLore = this.docs.list('lore', { entity_id })
      for (const l of existingLore) {
        this.docs.delete('lore', (l as Record<string, string>).id)
      }
      for (const entry of lore) {
        const l = entry as Record<string, string>
        this.docs.put('lore', l.id, entry as Record<string, unknown>)
      }

      // Restore aesthetic: delete existing, put snapshot version (if non-null)
      const existingAesthetics = this.docs.list('aesthetics', { entity_id })
      for (const a of existingAesthetics) {
        this.docs.delete('aesthetics', (a as Record<string, string>).id)
      }
      if (aesthetic !== null) {
        const a = aesthetic as Record<string, string>
        this.docs.put('aesthetics', a.id, aesthetic as Record<string, unknown>)
      }
    })
  }

  private loadGuardrails(entityId: string): Record<string, unknown>[] {
    return this.docs.list('guardrails', { entity_id: entityId })
  }
}
