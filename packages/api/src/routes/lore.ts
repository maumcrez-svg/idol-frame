import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { LoreGraph } from '../../../identity/src/lore-graph.js'
import type { EntityStore } from '../../../identity/src/entity-store.js'
import { LoreCategorySchema } from '../../../schema/src/index.js'
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js'

export interface LoreDeps {
  loreGraph: LoreGraph
  entityStore: EntityStore
}

const EntityIdParamsSchema = z.object({
  id: z.string().startsWith('e-'),
})

const LoreIdParamsSchema = z.object({
  id: z.string().startsWith('e-'),
  loreId: z.string().startsWith('lr-'),
})

const ListLoreQuerySchema = z.object({
  category: LoreCategorySchema.optional(),
})

const CreateLoreBodySchema = z.object({
  category: z.enum(['Biographical', 'Relational', 'WorldKnowledge', 'Preference']),
  content: z.string().max(10000),
  supersedes: z.string().startsWith('lr-').optional(),
})

export function registerLoreRoutes(
  app: FastifyInstance,
  deps: LoreDeps,
): void {
  const { loreGraph, entityStore } = deps

  app.get('/v1/entities/:id/lore', async (req, reply) => {
    const { id } = validateParams(req, EntityIdParamsSchema)
    const query = validateQuery(req, ListLoreQuerySchema)

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

    const lore = query.category
      ? loreGraph.listByCategory(id, query.category)
      : loreGraph.listByEntity(id, true)

    return {
      data: lore,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })

  app.post('/v1/entities/:id/lore', async (req, reply) => {
    const { id } = validateParams(req, EntityIdParamsSchema)
    const body = validateBody(req, CreateLoreBodySchema)

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

    // Check consistency before adding
    const consistency = loreGraph.checkConsistency(id, body.content)
    if (!consistency.consistent) {
      reply.code(409)
      return {
        data: null,
        meta: {
          request_id: req.id,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: [
          {
            message: 'Lore consistency conflict detected',
            details: {
              conflicts: consistency.conflicts.map(c => ({
                id: c.id,
                category: c.category,
                content: c.content,
              })),
            },
          },
        ],
      }
    }

    const lore = loreGraph.add({
      entity_id: id,
      category: body.category,
      content: body.content,
      supersedes: body.supersedes,
    })

    reply.code(201)
    return {
      data: lore,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })

  app.delete('/v1/entities/:id/lore/:loreId', async (req, reply) => {
    const { id, loreId } = validateParams(req, LoreIdParamsSchema)

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

    const existing = loreGraph.get(loreId)
    if (!existing) {
      reply.code(404)
      return {
        data: null,
        meta: {
          request_id: req.id,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: [{ message: `Lore entry not found: ${loreId}` }],
      }
    }

    if (existing.entity_id !== id) {
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
            message: `Lore entry ${loreId} does not belong to entity ${id}`,
          },
        ],
      }
    }

    loreGraph.revoke(loreId)

    return {
      data: { id: loreId, revoked: true },
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })
}
