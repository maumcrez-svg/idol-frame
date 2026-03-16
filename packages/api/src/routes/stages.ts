import { z } from 'zod'
import { v4 as uuid } from 'uuid'
import type { FastifyInstance } from 'fastify'
import type { IDocumentStore } from '../../../storage/src/index.js'
import { FormatSpecSchema, StageSchema } from '../../../schema/src/index.js'
import { validateBody, validateParams } from '../middleware/validate.js'

export interface StageDeps {
  docs: IDocumentStore
}

const COLLECTION = 'stages'

const StageIdParamsSchema = z.object({
  id: z.string().startsWith('stg-'),
})

const CreateStageBodySchema = z.object({
  name: z.string(),
  platform: z.string(),
  format_spec: FormatSpecSchema.optional(),
  adapter_type: z.string(),
})

export function registerStageRoutes(
  app: FastifyInstance,
  deps: StageDeps,
): void {
  const { docs } = deps

  app.get('/v1/stages', async (req) => {
    const stages = docs
      .list(COLLECTION)
      .map(d => StageSchema.parse(d))
      .filter(s => s.active)

    return {
      data: stages,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })

  app.post('/v1/stages', async (req, reply) => {
    const body = validateBody(req, CreateStageBodySchema)

    const stage = StageSchema.parse({
      id: `stg-${uuid()}`,
      name: body.name,
      platform: body.platform,
      format_spec: body.format_spec ?? {},
      adapter_type: body.adapter_type,
      active: true,
      created_at: new Date().toISOString(),
    })

    docs.put(COLLECTION, stage.id, stage)

    reply.code(201)
    return {
      data: stage,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })

  app.get('/v1/stages/:id', async (req, reply) => {
    const { id } = validateParams(req, StageIdParamsSchema)

    const doc = docs.get(COLLECTION, id)
    if (!doc) {
      reply.code(404)
      return {
        data: null,
        meta: {
          request_id: req.id,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: [{ message: `Stage not found: ${id}` }],
      }
    }

    const stage = StageSchema.parse(doc)

    return {
      data: stage,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })

  app.delete('/v1/stages/:id', async (req, reply) => {
    const { id } = validateParams(req, StageIdParamsSchema)

    const doc = docs.get(COLLECTION, id)
    if (!doc) {
      reply.code(404)
      return {
        data: null,
        meta: {
          request_id: req.id,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: [{ message: `Stage not found: ${id}` }],
      }
    }

    const stage = StageSchema.parse(doc)
    const deactivated = StageSchema.parse({
      ...stage,
      active: false,
    })

    docs.put(COLLECTION, id, deactivated)

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
