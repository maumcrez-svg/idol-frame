import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { IdentityCoreManager } from '../../../identity/src/identity-core-manager.js'
import type { EntityStore } from '../../../identity/src/entity-store.js'
import {
  ValueEntrySchema,
  WorldviewSpecSchema,
  TensionSchema,
} from '../../../schema/src/index.js'
import { validateBody, validateParams } from '../middleware/validate.js'

export interface IdentityCoreDeps {
  identityCoreManager: IdentityCoreManager
  entityStore: EntityStore
}

const EntityIdParamsSchema = z.object({
  id: z.string().startsWith('e-'),
})

const CreateVersionBodySchema = z.object({
  values: z.array(ValueEntrySchema).optional(),
  worldview: WorldviewSpecSchema.optional(),
  core_tensions: z.array(TensionSchema).optional(),
  recognition_markers: z.array(z.string()).optional(),
})

export function registerIdentityCoreRoutes(
  app: FastifyInstance,
  deps: IdentityCoreDeps,
): void {
  const { identityCoreManager, entityStore } = deps

  app.get('/v1/entities/:id/identity-core', async (req, reply) => {
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

    const core = identityCoreManager.getByEntity(id)
    if (!core) {
      reply.code(404)
      return {
        data: null,
        meta: {
          request_id: req.id,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: [{ message: `IdentityCore not found for entity: ${id}` }],
      }
    }

    return {
      data: core,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })

  app.post('/v1/entities/:id/identity-core/version', async (req, reply) => {
    const { id } = validateParams(req, EntityIdParamsSchema)
    const body = validateBody(req, CreateVersionBodySchema)

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

    const newCore = identityCoreManager.createNewVersion(id, {
      values: body.values,
      worldview: body.worldview,
      core_tensions: body.core_tensions,
      recognition_markers: body.recognition_markers,
    })

    reply.code(201)
    return {
      data: newCore,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })
}
