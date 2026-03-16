import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { FrameAssembler } from '../../../cognition/src/frame-assembler.js'
import type { Generator } from '../../../performance/src/generator.js'
import type { PerformanceEvaluator } from '../../../performance/src/evaluator.js'
import type { Publisher } from '../../../performance/src/publisher.js'
import type { SideEffectProcessor } from '../../../performance/src/side-effect-processor.js'
import type { EntityStore } from '../../../identity/src/entity-store.js'
import { PerformanceModeSchema } from '../../../schema/src/index.js'
import type { Stage } from '../../../schema/src/index.js'
import type { IDocumentStore, IPerformanceLog } from '../../../storage/src/index.js'
import type { HealthAggregator } from '../../../evaluation/src/health-aggregator.js'
import { validateBody, validateParams } from '../middleware/validate.js'
import { StageSchema } from '../../../schema/src/index.js'

export interface PerformanceDeps {
  frameAssembler: FrameAssembler
  generator: Generator
  evaluator: PerformanceEvaluator
  publisher: Publisher
  sideEffectProcessor: SideEffectProcessor
  entityStore: EntityStore
  performanceLog: IPerformanceLog
  healthAggregator: HealthAggregator
  docs: IDocumentStore
  defaultStage: Stage
}

const PerformBodySchema = z.object({
  mode: PerformanceModeSchema,
  context: z.string().min(1).max(50000),
  stage_id: z.string().startsWith('stg-').optional(),
  interaction_type: z.enum(['Proactive', 'Reactive', 'Scheduled']).default('Reactive'),
})

const EntityIdParamsSchema = z.object({
  id: z.string().startsWith('e-'),
})

export function registerPerformanceRoutes(app: FastifyInstance, deps: PerformanceDeps): void {
  const {
    frameAssembler, generator, evaluator, publisher,
    sideEffectProcessor, entityStore, performanceLog,
    healthAggregator, docs, defaultStage,
  } = deps

  // --- Trigger a performance ---
  app.post('/v1/entities/:id/perform', async (req, reply) => {
    const { id } = validateParams(req, EntityIdParamsSchema)
    const body = validateBody(req, PerformBodySchema)

    // Resolve entity
    const entity = entityStore.getOrFail(id)

    // Resolve stage
    let stage = defaultStage
    if (body.stage_id) {
      const stageDoc = docs.get('stages', body.stage_id)
      if (stageDoc) {
        stage = StageSchema.parse(stageDoc)
      }
    }

    // 1. Assemble DecisionFrame
    const frame = await frameAssembler.assemble({
      entity_id: id,
      stage,
      interaction_context: {
        type: body.interaction_type,
        trigger: body.context.substring(0, 200),
        audience: null,
      },
      query: body.context,
    })

    // 2. Generate (with retry loop)
    let lastEval = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { content, raw_llm_output } = await generator.generate(
        entity, frame, body.mode, body.context,
      )

      // 3. Evaluate
      const evaluation = await evaluator.evaluate(content, frame, attempt)
      lastEval = { content, raw_llm_output, evaluation }

      if (evaluation.action === 'Publish') {
        // 4. Publish
        const performance = publisher.publish({
          entity_id: id,
          frame,
          mode: body.mode,
          content,
          raw_llm_output,
          evaluation: {
            identity_score: evaluation.identity_score.overall,
            voice_score: evaluation.voice_score.overall,
            guardrail_passed: evaluation.guardrail_result.passed,
            guardrail_violations: evaluation.guardrail_result.violations.map(v => v.reason),
            quality_score: evaluation.quality_score,
            details: {
              identity: evaluation.identity_score,
              voice: evaluation.voice_score,
            },
          },
          continuity_notes: [],
        })

        // 5. Side effects (memory creation)
        const continuityNotes = await sideEffectProcessor.process({
          entity_id: id,
          output: content,
          frame,
          mode: body.mode,
          context: body.context,
        })

        reply.code(201)
        return {
          data: { ...performance, continuity_notes: continuityNotes },
          meta: {
            request_id: req.id,
            timestamp: new Date().toISOString(),
            version: 'v1',
            attempt,
          },
          errors: [],
        }
      }

      if (evaluation.action === 'Block') break
    }

    // All attempts failed
    reply.code(422)
    return {
      data: null,
      meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
      errors: [{
        message: 'Performance blocked after max attempts',
        details: lastEval?.evaluation ?? null,
      }],
    }
  })

  // --- Performance history ---
  app.get('/v1/entities/:id/performances', async (req) => {
    const { id } = validateParams(req, EntityIdParamsSchema)
    const query = req.query as { limit?: string }
    const entries = performanceLog.getByEntity(id, query.limit ? parseInt(query.limit) : 50)
    return {
      data: entries,
      meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
      errors: [],
    }
  })

  // --- Health / Evaluation ---
  app.get('/v1/entities/:id/health', async (req) => {
    const { id } = validateParams(req, EntityIdParamsSchema)
    const summary = healthAggregator.summarize(id)
    return {
      data: summary,
      meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
      errors: [],
    }
  })
}
