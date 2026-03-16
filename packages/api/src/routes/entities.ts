import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { EntityStore } from '../../../identity/src/entity-store.js'
import type { IdentityCoreManager } from '../../../identity/src/identity-core-manager.js'
import type { VoiceRegistry } from '../../../identity/src/voice-registry.js'
import type { TraitEngine } from '../../../identity/src/trait-engine.js'
import type { AestheticRegistry } from '../../../identity/src/aesthetic-registry.js'
import type { LoreGraph } from '../../../identity/src/lore-graph.js'
import type { IDocumentStore } from '../../../storage/src/index.js'
import {
  ValueEntrySchema,
  WorldviewSpecSchema,
  TensionSchema,
  VocabularySpecSchema,
  SyntaxSpecSchema,
  RhetoricSpecSchema,
  EmotionalRegisterSpecSchema,
  GuardrailCategorySchema,
  GuardrailEnforcementSchema,
  GuardrailSchema,
} from '../../../schema/src/index.js'
import { v4 as uuid } from 'uuid'
import { validateBody, validateParams } from '../middleware/validate.js'

export interface EntityDeps {
  entityStore: EntityStore
  identityCoreManager: IdentityCoreManager
  voiceRegistry: VoiceRegistry
  traitEngine: TraitEngine
  aestheticRegistry: AestheticRegistry
  loreGraph: LoreGraph
  docs: IDocumentStore
}

const CreateEntityBodySchema = z.object({
  name: z.string().min(1),
  archetype: z.string().min(1),
  role: z.string().min(1),
  domain: z.string().min(1),
  identity_core: z.object({
    values: z.array(ValueEntrySchema).default([]),
    worldview: WorldviewSpecSchema.optional(),
    core_tensions: z.array(TensionSchema).optional(),
    recognition_markers: z.array(z.string()).optional(),
  }).optional(),
  voice: z.object({
    vocabulary: VocabularySpecSchema.optional(),
    syntax: SyntaxSpecSchema.optional(),
    rhetoric: RhetoricSpecSchema.optional(),
    emotional_register: EmotionalRegisterSpecSchema.optional(),
  }).optional(),
  traits: z.array(z.object({
    name: z.string(),
    value: z.number().min(0).max(1),
    description: z.string().optional(),
    range: z.object({ min: z.number(), max: z.number() }).optional(),
    expression_rules: z.array(z.string()).optional(),
  })).optional(),
  guardrails: z.array(z.object({
    name: z.string(),
    category: GuardrailCategorySchema,
    condition: z.string(),
    enforcement: GuardrailEnforcementSchema.optional(),
    description: z.string().optional(),
  })).optional(),
})

const EntityIdParamsSchema = z.object({
  id: z.string().startsWith('e-'),
})

const UpdateEntityBodySchema = z.object({
  name: z.string().min(1).optional(),
  archetype: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  domain: z.string().min(1).optional(),
})

const CreateTraitBodySchema = z.object({
  name: z.string(),
  value: z.number().min(0).max(1),
  description: z.string().optional(),
  range: z.object({ min: z.number(), max: z.number() }).optional(),
  expression_rules: z.array(z.string()).optional(),
})

const TraitIdParamsSchema = z.object({
  id: z.string().startsWith('e-'),
  traitId: z.string().startsWith('tr-'),
})

const SetTraitValueBodySchema = z.object({
  value: z.number().min(0).max(1),
})

export function registerEntityRoutes(app: FastifyInstance, deps: EntityDeps): void {
  const { entityStore, identityCoreManager, voiceRegistry, traitEngine, aestheticRegistry, docs } = deps

  // --- Entity CRUD ---

  app.post('/v1/entities', async (req, reply) => {
    const body = validateBody(req, CreateEntityBodySchema)

    const entity = entityStore.create({
      name: body.name,
      archetype: body.archetype,
      role: body.role,
      domain: body.domain,
    })

    // Create IdentityCore
    if (body.identity_core) {
      identityCoreManager.create({ entity_id: entity.id, ...body.identity_core })
    } else {
      identityCoreManager.create({ entity_id: entity.id, values: [] })
    }

    // Create Voice
    if (body.voice) {
      voiceRegistry.create({ entity_id: entity.id, ...body.voice })
    } else {
      voiceRegistry.create({ entity_id: entity.id })
    }

    // Create Aesthetic (Invariant 1: required for entity completeness)
    aestheticRegistry.getOrCreateDefault(entity.id)

    // Create traits
    if (body.traits) {
      for (const t of body.traits) {
        traitEngine.create({ entity_id: entity.id, ...t })
      }
    }

    // Create guardrails
    if (body.guardrails) {
      for (const g of body.guardrails) {
        const guardrail = GuardrailSchema.parse({
          id: `gr-${uuid()}`,
          entity_id: entity.id,
          name: g.name,
          description: g.description ?? '',
          category: g.category,
          condition: g.condition,
          enforcement: g.enforcement ?? 'Block',
          active: true,
          created_at: new Date().toISOString(),
        })
        docs.put('guardrails', guardrail.id, guardrail)
      }
    }

    reply.code(201)
    return {
      data: entity,
      meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
      errors: [],
    }
  })

  app.get('/v1/entities', async (req) => {
    const query = req.query as { status?: string }
    const filter = query.status ? { status: query.status } : undefined
    const entities = entityStore.list(filter as { status?: 'Active' | 'Archived' })
    return {
      data: entities,
      meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
      errors: [],
    }
  })

  app.get('/v1/entities/:id', async (req, reply) => {
    const { id } = validateParams(req, EntityIdParamsSchema)
    const entity = entityStore.get(id)
    if (!entity) {
      reply.code(404)
      return {
        data: null,
        meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
        errors: [{ message: `Entity not found: ${id}` }],
      }
    }

    const identityCore = identityCoreManager.getByEntity(id)
    const voice = voiceRegistry.getByEntity(id)
    const traits = traitEngine.listByEntity(id)
    const aesthetic = aestheticRegistry.getByEntity(id)
    const guardrails = docs.list('guardrails', { entity_id: id }).filter((g: Record<string, unknown>) => g.active)

    return {
      data: { entity, identity_core: identityCore, voice, traits, aesthetic, guardrails },
      meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
      errors: [],
    }
  })

  app.put('/v1/entities/:id', async (req) => {
    const { id } = validateParams(req, EntityIdParamsSchema)
    const body = validateBody(req, UpdateEntityBodySchema)
    const entity = entityStore.update(id, body)
    return {
      data: entity,
      meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
      errors: [],
    }
  })

  app.delete('/v1/entities/:id', async (req) => {
    const { id } = validateParams(req, EntityIdParamsSchema)
    const entity = entityStore.archive(id)
    return {
      data: entity,
      meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
      errors: [],
    }
  })

  // --- Traits ---

  app.get('/v1/entities/:id/traits', async (req) => {
    const { id } = validateParams(req, EntityIdParamsSchema)
    entityStore.getOrFail(id)
    const traits = traitEngine.listByEntity(id)
    return {
      data: traits,
      meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
      errors: [],
    }
  })

  app.post('/v1/entities/:id/traits', async (req, reply) => {
    const { id } = validateParams(req, EntityIdParamsSchema)
    const body = validateBody(req, CreateTraitBodySchema)
    entityStore.getOrFail(id)
    const trait = traitEngine.create({ entity_id: id, ...body })
    reply.code(201)
    return {
      data: trait,
      meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
      errors: [],
    }
  })

  app.put('/v1/entities/:id/traits/:traitId/value', async (req) => {
    const { traitId } = validateParams(req, TraitIdParamsSchema)
    const body = validateBody(req, SetTraitValueBodySchema)
    const trait = traitEngine.setValue(traitId, body.value)
    return {
      data: trait,
      meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
      errors: [],
    }
  })
}
