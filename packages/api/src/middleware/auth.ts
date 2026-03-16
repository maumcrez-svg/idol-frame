import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'

async function authPlugin(app: FastifyInstance): Promise<void> {
  const apiKey = process.env.IDOL_FRAME_API_KEY

  // If no API key configured, skip auth (development mode)
  if (!apiKey) {
    app.log.warn('IDOL_FRAME_API_KEY not set — API is unauthenticated. Set it in production.')
    return
  }

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for health check
    if (request.url === '/health') return

    const authHeader = request.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.code(401).send({
        data: null,
        meta: { request_id: request.id as string, timestamp: new Date().toISOString(), version: 'v1' },
        errors: [{ message: 'Missing or invalid Authorization header. Use: Bearer <api_key>' }],
      })
      return
    }

    const token = authHeader.substring(7)
    if (token !== apiKey) {
      reply.code(403).send({
        data: null,
        meta: { request_id: request.id as string, timestamp: new Date().toISOString(), version: 'v1' },
        errors: [{ message: 'Invalid API key' }],
      })
      return
    }
  })
}

export const authMiddleware = fp(authPlugin, {
  name: 'idol-frame-auth',
  fastify: '5.x',
})
