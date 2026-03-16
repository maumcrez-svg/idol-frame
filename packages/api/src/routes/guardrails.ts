import { z } from 'zod'
import { v4 as uuid } from 'uuid'
import type { FastifyInstance } from 'fastify'
import type { IDocumentStore } from '../../../storage/src/index.js'
import type { EntityStore } from '../../../identity/src/entity-store.js'
import {
  GuardrailCategorySchema,
  GuardrailEnforcementSchema,
  GuardrailSchema,
} from '../../../schema/src/index.js'
import { validateBody, validateParams } from '../middleware/validate.js'

export interface GuardrailDeps {
  docs: IDocumentStore
  entityStore: EntityStore
}

const COLLECTION = 'guardrails'

const EntityIdParamsSchema = z.object({
  id: z.string().startsWith('e-'),
})

const GuardrailIdParamsSchema = z.object({
  id: z.string().startsWith('e-'),
  guardrailId: z.string().startsWith('gr-'),
})

const CreateGuardrailBodySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  category: GuardrailCategorySchema,
  condition: z.string().max(2000),
  enforcement: GuardrailEnforcementSchema.optional(),
})

export function registerGuardrailRoutes(
  app: FastifyInstance,
  deps: GuardrailDeps,
): void {
  const { docs, entityStore } = deps

  app.get('/v1/entities/:id/guardrails', async (req, reply) => {
    const { id } = validateParams(req, EntityIdParamsSchema)

    const entity = entityStore.get(id)
    if (!entity) {
      reply.code(404)
      return {
        data: null,
        meta: {
          request_id: req.id,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: [{ message: `Entity not found: ${id}` }],
      }
    }

    const guardrails = docs
      .list(COLLECTION, { entity_id: id })
      .map(d => GuardrailSchema.parse(d))
      .filter(g => g.active)

    return {
      data: guardrails,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })

  app.post('/v1/entities/:id/guardrails', async (req, reply) => {
    const { id } = validateParams(req, EntityIdParamsSchema)
    const body = validateBody(req, CreateGuardrailBodySchema)

    const entity = entityStore.get(id)
    if (!entity) {
      reply.code(404)
      return {
        data: null,
        meta: {
          request_id: req.id,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: [{ message: `Entity not found: ${id}` }],
      }
    }

    const guardrail = GuardrailSchema.parse({
      id: `gr-${uuid()}`,
      entity_id: id,
      name: body.name,
      description: body.description ?? '',
      category: body.category,
      condition: body.condition,
      enforcement: body.enforcement ?? 'Block',
      active: true,
      created_at: new Date().toISOString(),
    })

    docs.put(COLLECTION, guardrail.id, guardrail)

    reply.code(201)
    return {
      data: guardrail,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })

  app.delete('/v1/entities/:id/guardrails/:guardrailId', async (req, reply) => {
    const { id, guardrailId } = validateParams(req, GuardrailIdParamsSchema)

    const entity = entityStore.get(id)
    if (!entity) {
      reply.code(404)
      return {
        data: null,
        meta: {
          request_id: req.id,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: [{ message: `Entity not found: ${id}` }],
      }
    }

    const doc = docs.get(COLLECTION, guardrailId)
    if (!doc) {
      reply.code(404)
      return {
        data: null,
        meta: {
          request_id: req.id,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: [{ message: `Guardrail not found: ${guardrailId}` }],
      }
    }

    const guardrail = GuardrailSchema.parse(doc)

    // Verify the guardrail belongs to this entity
    if (guardrail.entity_id !== id) {
      reply.code(404)
      return {
        data: null,
        meta: {
          request_id: req.id,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: [
          {
            message: `Guardrail ${guardrailId} does not belong to entity ${id}`,
          },
        ],
      }
    }

    // Soft-deactivate
    const deactivated = GuardrailSchema.parse({
      ...guardrail,
      active: false,
    })
    docs.put(COLLECTION, guardrailId, deactivated)

    return {
      data: deactivated,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })
}
