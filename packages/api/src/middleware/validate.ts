import { z } from 'zod'
import type { FastifyRequest } from 'fastify'

export function validateBody<T extends z.ZodSchema>(
  req: FastifyRequest,
  schema: T,
): z.infer<T> {
  return schema.parse(req.body)
}

export function validateQuery<T extends z.ZodSchema>(
  req: FastifyRequest,
  schema: T,
): z.infer<T> {
  return schema.parse(req.query)
}

export function validateParams<T extends z.ZodSchema>(
  req: FastifyRequest,
  schema: T,
): z.infer<T> {
  return schema.parse(req.params)
}
