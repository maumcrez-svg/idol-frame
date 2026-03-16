import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { SnapshotManager } from '../../../identity/src/snapshot-manager.js'
import type { EntityStore } from '../../../identity/src/entity-store.js'
import { validateBody, validateParams } from '../middleware/validate.js'

export interface SnapshotDeps {
  snapshotManager: SnapshotManager
  entityStore: EntityStore
}

const EntityIdParamsSchema = z.object({
  id: z.string().startsWith('e-'),
})

const SnapshotIdParamsSchema = z.object({
  id: z.string().startsWith('e-'),
  snapshotId: z.string().startsWith('snap-'),
})

const CaptureSnapshotBodySchema = z.object({
  label: z.string().optional(),
})

export function registerSnapshotRoutes(
  app: FastifyInstance,
  deps: SnapshotDeps,
): void {
  const { snapshotManager, entityStore } = deps

  app.get('/v1/entities/:id/snapshots', async (req, reply) => {
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

    const snapshots = snapshotManager.list(id)

    return {
      data: snapshots,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })

  app.post('/v1/entities/:id/snapshots', async (req, reply) => {
    const { id } = validateParams(req, EntityIdParamsSchema)
    const body = validateBody(req, CaptureSnapshotBodySchema)

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

    const snapshot = snapshotManager.capture(id, body.label)

    reply.code(201)
    return {
      data: snapshot,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })

  app.get('/v1/entities/:id/snapshots/:snapshotId', async (req, reply) => {
    const { id, snapshotId } = validateParams(req, SnapshotIdParamsSchema)

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

    const snapshot = snapshotManager.get(snapshotId)
    if (!snapshot) {
      reply.code(404)
      return {
        data: null,
        meta: {
          request_id: req.id,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: [{ message: `Snapshot not found: ${snapshotId}` }],
      }
    }

    if (snapshot.entity_id !== id) {
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
            message: `Snapshot ${snapshotId} does not belong to entity ${id}`,
          },
        ],
      }
    }

    return {
      data: snapshot,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })

  app.post(
    '/v1/entities/:id/snapshots/:snapshotId/restore',
    async (req, reply) => {
      const { id, snapshotId } = validateParams(req, SnapshotIdParamsSchema)

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

      const snapshot = snapshotManager.get(snapshotId)
      if (!snapshot) {
        reply.code(404)
        return {
          data: null,
          meta: {
            request_id: req.id,
            timestamp: new Date().toISOString(),
            version: 'v1',
          },
          errors: [{ message: `Snapshot not found: ${snapshotId}` }],
        }
      }

      if (snapshot.entity_id !== id) {
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
              message: `Snapshot ${snapshotId} does not belong to entity ${id}`,
            },
          ],
        }
      }

      snapshotManager.restore(snapshotId)

      return {
        data: { snapshot_id: snapshotId, restored: true },
        meta: {
          request_id: req.id,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: [],
      }
    },
  )
}
