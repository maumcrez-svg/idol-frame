import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { EpochManager } from '../../../state/src/epoch-manager.js'
import type { EntityStore } from '../../../identity/src/entity-store.js'
import { validateBody, validateParams } from '../middleware/validate.js'

export interface EpochDeps {
  epochManager: EpochManager
  entityStore: EntityStore
}

const EntityIdParamsSchema = z.object({
  id: z.string().startsWith('e-'),
})

const EpochIdParamsSchema = z.object({
  id: z.string().startsWith('e-'),
  epochId: z.string().startsWith('epoch-'),
})

const CreateEpochBodySchema = z.object({
  name: z.string().min(1),
  ordinal: z.number().int().min(0).optional(),
  identity_core_version: z.string().optional(),
  trait_ranges: z.record(
    z.string(),
    z.object({ min: z.number(), max: z.number() }),
  ).optional(),
  characteristic_mood: z.string().nullable().optional(),
  start_condition: z.string().optional(),
  end_condition: z.string().optional(),
})

const TransitionBodySchema = z.object({
  next_epoch_id: z.string().startsWith('epoch-'),
})

export function registerEpochRoutes(
  app: FastifyInstance,
  deps: EpochDeps,
): void {
  const { epochManager, entityStore } = deps

  // List epochs
  app.get('/v1/entities/:id/epochs', async (req, reply) => {
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

    const epochs = epochManager.list(id)

    return {
      data: epochs,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })

  // Create epoch
  app.post('/v1/entities/:id/epochs', async (req, reply) => {
    const { id } = validateParams(req, EntityIdParamsSchema)
    const body = validateBody(req, CreateEpochBodySchema)

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

    const epoch = epochManager.create({
      entity_id: id,
      name: body.name,
      ordinal: body.ordinal,
      identity_core_version: body.identity_core_version,
      trait_ranges: body.trait_ranges,
      characteristic_mood: body.characteristic_mood,
      start_condition: body.start_condition,
      end_condition: body.end_condition,
    })

    reply.code(201)
    return {
      data: epoch,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })

  // Get active epoch
  app.get('/v1/entities/:id/epochs/active', async (req, reply) => {
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

    const active = epochManager.getActive(id)
    if (!active) {
      reply.code(404)
      return {
        data: null,
        meta: {
          request_id: req.id,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: [{ message: `No active epoch found for entity ${id}` }],
      }
    }

    return {
      data: active,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })

  // Transition to next epoch
  app.post('/v1/entities/:id/epochs/:epochId/transition', async (req, reply) => {
    const { id, epochId } = validateParams(req, EpochIdParamsSchema)
    const body = validateBody(req, TransitionBodySchema)

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

    const currentEpoch = epochManager.get(epochId)
    if (!currentEpoch) {
      reply.code(404)
      return {
        data: null,
        meta: {
          request_id: req.id,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: [{ message: `Epoch not found: ${epochId}` }],
      }
    }

    if (currentEpoch.entity_id !== id) {
      reply.code(404)
      return {
        data: null,
        meta: {
          request_id: req.id,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: [{ message: `Epoch ${epochId} does not belong to entity ${id}` }],
      }
    }

    const nextEpoch = epochManager.get(body.next_epoch_id)
    if (!nextEpoch) {
      reply.code(404)
      return {
        data: null,
        meta: {
          request_id: req.id,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: [{ message: `Next epoch not found: ${body.next_epoch_id}` }],
      }
    }

    let result
    try {
      result = epochManager.transition(epochId, body.next_epoch_id)
    } catch (err) {
      if (err instanceof Error && (
        err.message.includes('must be') ||
        err.message.includes('Cannot') ||
        err.message.includes('different entities')
      )) {
        reply.code(409)
        return {
          data: null,
          meta: {
            request_id: req.id,
            timestamp: new Date().toISOString(),
            version: 'v1',
          },
          errors: [{ message: err.message }],
        }
      }
      throw err
    }

    return {
      data: {
        completed: result.completed,
        activated: result.activated,
      },
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })
}
