import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import type { Envelope } from './envelope.js'

function isNotFoundError(error: Error): boolean {
  return error.message.includes('not found') || error.message.includes('Not found')
}

function isInvariantViolation(error: Error): boolean {
  return (
    error.message.includes('Invariant') ||
    error.message.includes('invariant') ||
    error.message.includes('integrity check failed') ||
    error.message.includes('Cannot update archived')
  )
}

export function createErrorHandler(nodeEnv: string) {
  return function errorHandler(
    error: FastifyError | Error,
    request: FastifyRequest,
    reply: FastifyReply,
  ): void {
    const meta = {
      request_id: request.id as string,
      timestamp: new Date().toISOString(),
      version: 'v1' as const,
    }

    // Zod validation errors -> 400
    if (error instanceof ZodError) {
      const errors = error.issues.map(issue => ({
        message: `${issue.path.join('.')}: ${issue.message}`,
        details: {
          path: issue.path,
          code: issue.code,
          expected: 'expected' in issue ? issue.expected : undefined,
          received: 'received' in issue ? issue.received : undefined,
        },
      }))

      const envelope: Envelope = {
        data: null,
        meta,
        errors,
      }

      reply.code(400).send(envelope)
      return
    }

    // Not found errors -> 404
    if (isNotFoundError(error)) {
      const envelope: Envelope = {
        data: null,
        meta,
        errors: [{ message: error.message }],
      }

      reply.code(404).send(envelope)
      return
    }

    // Invariant violations -> 409 Conflict
    if (isInvariantViolation(error)) {
      const envelope: Envelope = {
        data: null,
        meta,
        errors: [{ message: error.message }],
      }

      reply.code(409).send(envelope)
      return
    }

    // Fastify validation errors (schema validation) -> 400
    if ('validation' in error && (error as FastifyError).validation) {
      const envelope: Envelope = {
        data: null,
        meta,
        errors: (error as FastifyError).validation!.map(v => ({
          message: v.message ?? 'Validation error',
        })),
      }

      reply.code(400).send(envelope)
      return
    }

    // Everything else -> 500
    const safeMessage =
      nodeEnv === 'production'
        ? 'Internal server error'
        : error.message ?? 'Internal server error'

    request.log.error(error)

    const envelope: Envelope = {
      data: null,
      meta,
      errors: [{ message: safeMessage }],
    }

    const statusCode =
      'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : 500

    reply.code(statusCode).send(envelope)
  }
}
