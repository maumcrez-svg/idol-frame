import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { DriftTracker } from '../../../state/src/drift-tracker.js'
import type { EntityStore } from '../../../identity/src/entity-store.js'
import { validateParams, validateQuery } from '../middleware/validate.js'

export interface DriftHistoryDeps {
  driftTracker: DriftTracker
  entityStore: EntityStore
}

const TraitParamsSchema = z.object({
  id: z.string().startsWith('e-'),
  traitName: z.string(),
})

const HistoryQuerySchema = z.object({
  after: z.string().optional(),
  before: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
})

const VelocityQuerySchema = z.object({
  window_hours: z.coerce.number().min(1).default(168),
})

const TrajectoryQuerySchema = z.object({
  points: z.coerce.number().int().min(2).max(1000).default(20),
})

const ValueAtQuerySchema = z.object({
  timestamp: z.string(),
})

export function registerDriftHistoryRoutes(
  app: FastifyInstance,
  deps: DriftHistoryDeps,
): void {
  const { driftTracker, entityStore } = deps

  // Get drift history for a trait
  app.get('/v1/entities/:id/traits/:traitName/history', async (req, reply) => {
    const { id, traitName } = validateParams(req, TraitParamsSchema)
    const query = validateQuery(req, HistoryQuerySchema)

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

    const events = driftTracker.getHistory(id, traitName, {
      after: query.after,
      before: query.before,
      limit: query.limit,
    })

    return {
      data: events,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })

  // Get velocity for a trait
  app.get('/v1/entities/:id/traits/:traitName/velocity', async (req, reply) => {
    const { id, traitName } = validateParams(req, TraitParamsSchema)
    const query = validateQuery(req, VelocityQuerySchema)

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

    const velocity = driftTracker.getVelocity(id, traitName, query.window_hours)

    return {
      data: velocity,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })

  // Get trajectory for a trait
  app.get('/v1/entities/:id/traits/:traitName/trajectory', async (req, reply) => {
    const { id, traitName } = validateParams(req, TraitParamsSchema)
    const query = validateQuery(req, TrajectoryQuerySchema)

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

    const trajectory = driftTracker.getTrajectory(id, traitName, query.points)

    return {
      data: trajectory,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })

  // Get value at a specific timestamp
  app.get('/v1/entities/:id/traits/:traitName/value-at', async (req, reply) => {
    const { id, traitName } = validateParams(req, TraitParamsSchema)
    const query = validateQuery(req, ValueAtQuerySchema)

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

    const value = driftTracker.getValueAt(id, traitName, query.timestamp)

    return {
      data: { value, queried_at: query.timestamp },
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })
}
