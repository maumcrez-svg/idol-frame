import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { EntityStore } from '../../../identity/src/entity-store.js'
import type { MemoryRetriever } from '../../../cognition/src/memory-retriever.js'
import type { MemoryConsolidator } from '../../../state/src/memory-consolidator.js'
import type { IVectorStore } from '../../../storage/src/index.js'
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js'

export interface MemoryDeps {
  entityStore: EntityStore
  memoryRetriever: MemoryRetriever
  memoryConsolidator: MemoryConsolidator
  vectors?: IVectorStore
}

const EntityIdParamsSchema = z.object({
  id: z.string().startsWith('e-'),
})

const NodeIdParamsSchema = z.object({
  nodeId: z.string().startsWith('mn-'),
})

const SearchBodySchema = z.object({
  query: z.string().min(1),
  top_k: z.number().int().min(1).max(50).default(5),
})

const GrepBodySchema = z.object({
  keyword: z.string().min(1),
  limit: z.number().int().min(1).max(100).default(10),
})

const NodesQuerySchema = z.object({
  level: z.coerce.number().int().min(0).optional(),
  unconsolidated_only: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
})

export function registerMemoryRoutes(app: FastifyInstance, deps: MemoryDeps): void {
  const { entityStore, memoryRetriever, memoryConsolidator } = deps

  // Semantic search
  app.post('/v1/entities/:id/memory/search', async (req, reply) => {
    const { id } = validateParams(req, EntityIdParamsSchema)
    const entity = entityStore.get(id)
    if (!entity) return reply.code(404).send({ data: null, errors: [{ message: 'Entity not found' }], meta: {} })

    const { query, top_k } = validateBody(req, SearchBodySchema)
    const results = await memoryRetriever.retrieve(id, query, top_k)

    return {
      data: results,
      meta: { count: results.length },
      errors: [],
    }
  })

  // FTS5 keyword search
  app.post('/v1/entities/:id/memory/grep', async (req, reply) => {
    const { id } = validateParams(req, EntityIdParamsSchema)
    const entity = entityStore.get(id)
    if (!entity) return reply.code(404).send({ data: null, errors: [{ message: 'Entity not found' }], meta: {} })

    const { keyword, limit } = validateBody(req, GrepBodySchema)
    const results = memoryRetriever.grep(id, keyword, limit)

    return {
      data: results,
      meta: { count: results.length },
      errors: [],
    }
  })

  // Trigger consolidation
  app.post('/v1/entities/:id/memory/consolidate', async (req, reply) => {
    const { id } = validateParams(req, EntityIdParamsSchema)
    const entity = entityStore.get(id)
    if (!entity) return reply.code(404).send({ data: null, errors: [{ message: 'Entity not found' }], meta: {} })

    const nodes = await memoryConsolidator.consolidate(id)

    // Flush vectors to cold storage after consolidation (natural batch point)
    const hybrid = deps.vectors as any
    if (hybrid?.flush && hybrid?.pendingCount > 0) {
      await hybrid.flush()
    }

    return {
      data: nodes,
      meta: { created: nodes.length },
      errors: [],
    }
  })

  // List DAG nodes
  app.get('/v1/entities/:id/memory/nodes', async (req, reply) => {
    const { id } = validateParams(req, EntityIdParamsSchema)
    const entity = entityStore.get(id)
    if (!entity) return reply.code(404).send({ data: null, errors: [{ message: 'Entity not found' }], meta: {} })

    const query = validateQuery(req, NodesQuerySchema)
    const nodes = memoryConsolidator.getNodes(id, {
      level: query.level,
      unconsolidated_only: query.unconsolidated_only,
    })

    return {
      data: nodes,
      meta: { count: nodes.length },
      errors: [],
    }
  })

  // Expand a node to its sources
  app.get('/v1/memory/nodes/:nodeId/expand', async (req) => {
    const { nodeId } = validateParams(req, NodeIdParamsSchema)
    const sources = memoryConsolidator.expand(nodeId)

    return {
      data: sources,
      meta: { count: sources.length },
      errors: [],
    }
  })
}
