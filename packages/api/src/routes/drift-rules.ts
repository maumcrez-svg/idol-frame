import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { DriftEngine } from '../../../state/src/drift-engine.js'
import type { EntityStore } from '../../../identity/src/entity-store.js'
import {
  DriftDirectionSchema,
  DriftTriggerSchema,
} from '../../../schema/src/index.js'
import { validateBody, validateParams } from '../middleware/validate.js'

export interface DriftRuleDeps {
  driftEngine: DriftEngine
  entityStore: EntityStore
}

const EntityIdParamsSchema = z.object({
  id: z.string().startsWith('e-'),
})

const DriftRuleIdParamsSchema = z.object({
  id: z.string().startsWith('e-'),
  ruleId: z.string().startsWith('drift-'),
})

const CreateDriftRuleBodySchema = z.object({
  trait_name: z.string(),
  rate: z.number().min(0).max(0.5),
  period_hours: z.number().optional(),
  direction: DriftDirectionSchema,
  triggers: z.array(DriftTriggerSchema).optional(),
  bounds: z.object({ min: z.number(), max: z.number() }),
})

export function registerDriftRuleRoutes(
  app: FastifyInstance,
  deps: DriftRuleDeps,
): void {
  const { driftEngine, entityStore } = deps

  // List drift rules
  app.get('/v1/entities/:id/drift-rules', async (req, reply) => {
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

    const rules = driftEngine.list(id)

    return {
      data: rules,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })

  // Create drift rule
  app.post('/v1/entities/:id/drift-rules', async (req, reply) => {
    const { id } = validateParams(req, EntityIdParamsSchema)
    const body = validateBody(req, CreateDriftRuleBodySchema)

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

    const rule = driftEngine.create({
      entity_id: id,
      trait_name: body.trait_name,
      rate: body.rate,
      period_hours: body.period_hours,
      direction: body.direction,
      triggers: body.triggers,
      bounds: body.bounds,
    })

    reply.code(201)
    return {
      data: rule,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })

  // Deactivate drift rule
  app.delete('/v1/entities/:id/drift-rules/:ruleId', async (req, reply) => {
    const { id, ruleId } = validateParams(req, DriftRuleIdParamsSchema)

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

    const rule = driftEngine.get(ruleId)
    if (!rule) {
      reply.code(404)
      return {
        data: null,
        meta: {
          request_id: req.id,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: [{ message: `Drift rule not found: ${ruleId}` }],
      }
    }

    if (rule.entity_id !== id) {
      reply.code(404)
      return {
        data: null,
        meta: {
          request_id: req.id,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: [{ message: `Drift rule ${ruleId} does not belong to entity ${id}` }],
      }
    }

    const deactivated = driftEngine.deactivate(ruleId)

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

  // Apply all drift rules now
  app.post('/v1/entities/:id/drift-rules/apply', async (req, reply) => {
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

    const results = driftEngine.applyAll(id)

    return {
      data: results,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })
}
