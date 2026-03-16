import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { DirectiveResolver } from '../../../cognition/src/directive-resolver.js'
import type { EntityStore } from '../../../identity/src/entity-store.js'
import type { IDocumentStore } from '../../../storage/src/index.js'
import {
  DirectiveScopeSchema,
  DirectiveExpirationSchema,
  GuardrailSchema,
} from '../../../schema/src/index.js'
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js'

export interface DirectiveDeps {
  directiveResolver: DirectiveResolver
  entityStore: EntityStore
  docs: IDocumentStore
}

const EntityIdParamsSchema = z.object({
  id: z.string().startsWith('e-'),
})

const DirectiveIdParamsSchema = z.object({
  id: z.string().startsWith('e-'),
  directiveId: z.string().startsWith('dir-'),
})

const ListDirectivesQuerySchema = z.object({
  include_inactive: z.string().optional(),
})

const CreateDirectiveBodySchema = z.object({
  priority: z.number().int().min(0).max(1000).optional(),
  scope: DirectiveScopeSchema,
  instruction: z.string().min(1).max(5000),
  rationale: z.string().optional(),
  expiration: DirectiveExpirationSchema,
})

export function registerDirectiveRoutes(
  app: FastifyInstance,
  deps: DirectiveDeps,
): void {
  const { directiveResolver, entityStore, docs } = deps

  app.get('/v1/entities/:id/directives', async (req, reply) => {
    const { id } = validateParams(req, EntityIdParamsSchema)
    const query = validateQuery(req, ListDirectivesQuerySchema)

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

    const includeInactive = query.include_inactive === 'true'
    const directives = directiveResolver.list(id, includeInactive)

    return {
      data: directives,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })

  app.post('/v1/entities/:id/directives', async (req, reply) => {
    const { id } = validateParams(req, EntityIdParamsSchema)
    const body = validateBody(req, CreateDirectiveBodySchema)

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

    // Load guardrails for conflict checking
    const guardrails = docs
      .list('guardrails', { entity_id: id })
      .map(d => GuardrailSchema.parse(d))
      .filter(g => g.active)

    let directive
    try {
      directive = directiveResolver.create(
        {
          entity_id: id,
          priority: body.priority,
          scope: body.scope,
          instruction: body.instruction,
          rationale: body.rationale ?? null,
          expiration: body.expiration,
        },
        guardrails,
      )
    } catch (err) {
      if (err instanceof Error && err.message.includes('Invariant 12')) {
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

    reply.code(201)
    return {
      data: directive,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })

  app.delete('/v1/entities/:id/directives/:directiveId', async (req, reply) => {
    const { id, directiveId } = validateParams(req, DirectiveIdParamsSchema)

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

    const existing = directiveResolver.get(directiveId)
    if (!existing) {
      reply.code(404)
      return {
        data: null,
        meta: {
          request_id: req.id,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: [{ message: `Directive not found: ${directiveId}` }],
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
        errors: [{ message: `Directive ${directiveId} does not belong to entity ${id}` }],
      }
    }

    const revoked = directiveResolver.revoke(directiveId)

    return {
      data: revoked,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })
}
