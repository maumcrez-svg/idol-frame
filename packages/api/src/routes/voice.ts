import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { VoiceRegistry } from '../../../identity/src/voice-registry.js'
import type { EntityStore } from '../../../identity/src/entity-store.js'
import {
  VocabularySpecSchema,
  SyntaxSpecSchema,
  RhetoricSpecSchema,
  EmotionalRegisterSpecSchema,
} from '../../../schema/src/index.js'
import { validateBody, validateParams } from '../middleware/validate.js'

export interface VoiceDeps {
  voiceRegistry: VoiceRegistry
  entityStore: EntityStore
}

const EntityIdParamsSchema = z.object({
  id: z.string().startsWith('e-'),
})

const UpdateVoiceBodySchema = z.object({
  vocabulary: VocabularySpecSchema.optional(),
  syntax: SyntaxSpecSchema.optional(),
  rhetoric: RhetoricSpecSchema.optional(),
  emotional_register: EmotionalRegisterSpecSchema.optional(),
})

export function registerVoiceRoutes(
  app: FastifyInstance,
  deps: VoiceDeps,
): void {
  const { voiceRegistry, entityStore } = deps

  app.get('/v1/entities/:id/voice', async (req, reply) => {
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

    const voice = voiceRegistry.getByEntity(id)
    if (!voice) {
      reply.code(404)
      return {
        data: null,
        meta: {
          request_id: req.id,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: [{ message: `Voice not found for entity: ${id}` }],
      }
    }

    return {
      data: voice,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })

  app.put('/v1/entities/:id/voice', async (req, reply) => {
    const { id } = validateParams(req, EntityIdParamsSchema)
    const body = validateBody(req, UpdateVoiceBodySchema)

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

    // VoiceRegistry.update exists: updates voice in-place
    const existingVoice = voiceRegistry.getByEntity(id)
    let voice
    if (existingVoice) {
      voice = voiceRegistry.update(id, body)
    } else {
      voice = voiceRegistry.create({ entity_id: id, ...body })
      reply.code(201)
    }

    return {
      data: voice,
      meta: {
        request_id: req.id,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      errors: [],
    }
  })
}
