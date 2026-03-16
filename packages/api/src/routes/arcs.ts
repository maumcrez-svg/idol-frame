import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { ArcDirector } from '../../../state/src/arc-director.js'
import type { EntityStore } from '../../../identity/src/entity-store.js'
import {
  ArcPhaseSchema,
  RollbackPolicySchema,
} from '../../../schema/src/index.js'
import { validateBody, validateParams } from '../middleware/validate.js'

export interface ArcDeps {
  arcDirector: ArcDirector
  entityStore: EntityStore
}

const EntityIdParamsSchema = z.object({
  id: z.string().startsWith('e-'),
})

const ArcIdParamsSchema = z.object({
  id: z.string().startsWith('e-'),
  arcId: z.string().startsWith('arc-'),
})

const CreateArcBodySchema = z.object({
  name: z.string().min(1),
  phases: z.array(ArcPhaseSchema).min(1),
  rollback_policy: RollbackPolicySchema.optional(),
})

export function registerArcRoutes(
  app: FastifyInstance,
  deps: ArcDeps,
): void {
  const { arcDirector, entityStore } = deps

  // List arcs
  app.get('/v1/entities/:id/arcs', async (req, reply) => {
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

    const arcs = arcDirector.list(id)

    return {
      data: arcs,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })

  // Create arc
  app.post('/v1/entities/:id/arcs', async (req, reply) => {
    const { id } = validateParams(req, EntityIdParamsSchema)
    const body = validateBody(req, CreateArcBodySchema)

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

    const arc = arcDirector.create({
      entity_id: id,
      name: body.name,
      phases: body.phases,
      rollback_policy: body.rollback_policy,
    })

    reply.code(201)
    return {
      data: arc,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })

  // Activate arc
  app.post('/v1/entities/:id/arcs/:arcId/activate', async (req, reply) => {
    const { id, arcId } = validateParams(req, ArcIdParamsSchema)

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

    const arc = arcDirector.get(arcId)
    if (!arc) {
      reply.code(404)
      return {
        data: null,
        meta: {
          request_id: req.id,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: [{ message: `Arc not found: ${arcId}` }],
      }
    }

    if (arc.entity_id !== id) {
      reply.code(404)
      return {
        data: null,
        meta: {
          request_id: req.id,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: [{ message: `Arc ${arcId} does not belong to entity ${id}` }],
      }
    }

    let activated
    try {
      activated = arcDirector.activate(arcId)
    } catch (err) {
      if (err instanceof Error && err.message.includes('Invariant 2')) {
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
      if (err instanceof Error && err.message.includes('Cannot activate')) {
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
      data: activated,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })

  // Advance phase
  app.post('/v1/entities/:id/arcs/:arcId/advance', async (req, reply) => {
    const { id, arcId } = validateParams(req, ArcIdParamsSchema)

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

    const arc = arcDirector.get(arcId)
    if (!arc) {
      reply.code(404)
      return {
        data: null,
        meta: {
          request_id: req.id,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: [{ message: `Arc not found: ${arcId}` }],
      }
    }

    if (arc.entity_id !== id) {
      reply.code(404)
      return {
        data: null,
        meta: {
          request_id: req.id,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: [{ message: `Arc ${arcId} does not belong to entity ${id}` }],
      }
    }

    let advanced
    try {
      advanced = arcDirector.advancePhase(arcId)
    } catch (err) {
      if (err instanceof Error && err.message.includes('Cannot advance')) {
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
      data: advanced,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })

  // Abort arc
  app.post('/v1/entities/:id/arcs/:arcId/abort', async (req, reply) => {
    const { id, arcId } = validateParams(req, ArcIdParamsSchema)

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

    const arc = arcDirector.get(arcId)
    if (!arc) {
      reply.code(404)
      return {
        data: null,
        meta: {
          request_id: req.id,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: [{ message: `Arc not found: ${arcId}` }],
      }
    }

    if (arc.entity_id !== id) {
      reply.code(404)
      return {
        data: null,
        meta: {
          request_id: req.id,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: [{ message: `Arc ${arcId} does not belong to entity ${id}` }],
      }
    }

    let aborted
    try {
      aborted = arcDirector.abort(arcId)
    } catch (err) {
      if (err instanceof Error && err.message.includes('Cannot abort')) {
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
      data: aborted,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })

  // Complete arc
  app.post('/v1/entities/:id/arcs/:arcId/complete', async (req, reply) => {
    const { id, arcId } = validateParams(req, ArcIdParamsSchema)

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

    const arc = arcDirector.get(arcId)
    if (!arc) {
      reply.code(404)
      return {
        data: null,
        meta: {
          request_id: req.id,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: [{ message: `Arc not found: ${arcId}` }],
      }
    }

    if (arc.entity_id !== id) {
      reply.code(404)
      return {
        data: null,
        meta: {
          request_id: req.id,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: [{ message: `Arc ${arcId} does not belong to entity ${id}` }],
      }
    }

    let completed
    try {
      completed = arcDirector.complete(arcId)
    } catch (err) {
      if (err instanceof Error && err.message.includes('Cannot complete')) {
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
      data: completed,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })

  // Get active arc with current phase
  app.get('/v1/entities/:id/arcs/active', async (req, reply) => {
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

    const phaseInfo = arcDirector.getCurrentPhase(id)
    if (!phaseInfo) {
      reply.code(404)
      return {
        data: null,
        meta: {
          request_id: req.id,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: [{ message: `No active arc found for entity ${id}` }],
      }
    }

    return {
      data: {
        arc: phaseInfo.arc,
        current_phase: phaseInfo.phase,
        phase_index: phaseInfo.index,
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
