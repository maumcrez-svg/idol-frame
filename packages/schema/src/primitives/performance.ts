import { z } from 'zod'

export const PerformanceModeSchema = z.enum(['live_host', 'short_video', 'editorial_post'])

export const EvaluationResultSchema = z.object({
  identity_score: z.number().min(0).max(1),
  voice_score: z.number().min(0).max(1),
  grounding_score: z.number().min(0).max(1).nullable().default(null),
  guardrail_passed: z.boolean(),
  guardrail_violations: z.array(z.string()).default([]),
  grounding_citations: z.array(z.object({
    claim: z.string(),
    memory_id: z.string(),
    verdict: z.string(),
  })).default([]),
  quality_score: z.number().min(0).max(1),
  details: z.record(z.string(), z.any()).default({}),
})

export const PerformanceSchema = z.object({
  id: z.string().startsWith('perf-'),
  entity_id: z.string().startsWith('e-'),
  decision_frame_id: z.string().startsWith('df-'),
  stage_id: z.string().startsWith('stg-'),
  mode: PerformanceModeSchema,
  content: z.string(),
  raw_llm_output: z.string(),
  evaluation: EvaluationResultSchema.nullable().default(null),
  continuity_notes: z.array(z.string()).default([]),
  published: z.boolean().default(false),
  timestamp: z.string(),
})

export type PerformanceMode = z.infer<typeof PerformanceModeSchema>
export type EvaluationResult = z.infer<typeof EvaluationResultSchema>
export type Performance = z.infer<typeof PerformanceSchema>
