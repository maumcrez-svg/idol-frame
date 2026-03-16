import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

export interface EnvelopeMeta {
  request_id: string
  timestamp: string
  version: string
}

export interface Envelope<T = unknown> {
  data: T | null
  meta: EnvelopeMeta
  errors: Array<{ message: string; details?: unknown }>
}

function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return 'data' in obj && 'meta' in obj && 'errors' in obj
}

async function envelopePlugin(app: FastifyInstance): Promise<void> {
  app.addHook(
    'onSend',
    async (
      request: FastifyRequest,
      reply: FastifyReply,
      payload: string | Buffer | null,
    ): Promise<string | Buffer | null> => {
      // Skip non-JSON content types
      const contentType = reply.getHeader('content-type')
      if (
        typeof contentType === 'string' &&
        !contentType.includes('application/json')
      ) {
        return payload
      }

      if (payload === null || payload === undefined) {
        return payload
      }

      let parsed: unknown
      try {
        parsed =
          typeof payload === 'string'
            ? JSON.parse(payload)
            : JSON.parse(payload.toString())
      } catch {
        // Not JSON, leave as-is
        return payload
      }

      // Already in envelope format
      if (isEnvelope(parsed)) {
        return typeof payload === 'string'
          ? payload
          : payload.toString()
      }

      const statusCode = reply.statusCode
      const isError = statusCode >= 400

      const envelope: Envelope = {
        data: isError ? null : parsed,
        meta: {
          request_id: request.id as string,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
        errors: isError
          ? [
              {
                message:
                  typeof parsed === 'object' &&
                  parsed !== null &&
                  'message' in parsed
                    ? String((parsed as Record<string, unknown>).message)
                    : 'Request failed',
              },
            ]
          : [],
      }

      reply.header('content-type', 'application/json; charset=utf-8')
      return JSON.stringify(envelope)
    },
  )
}

export const envelopeMiddleware = fp(envelopePlugin, {
  name: 'idol-frame-envelope',
  fastify: '5.x',
})
