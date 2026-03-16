import { z } from 'zod'

export const ArcStatusSchema = z.enum(['Planned', 'Active', 'Completed', 'Aborted'])
export const RollbackPolicySchema = z.enum(['AutoOnAbort', 'ManualOnly', 'NoRollback'])

export const TransitionConditionTypeSchema = z.enum(['TimeBased', 'EventBased', 'MetricBased', 'CreatorManual'])

export const TransitionConditionSchema = z.object({
  type: TransitionConditionTypeSchema,
  condition: z.string(),
  evaluator: z.string().default('manual'),
  auto_advance: z.boolean().default(false),
})

export const ArcPhaseSchema = z.object({
  name: z.string(),
  description: z.string().default(''),
  target_traits: z.record(z.string(), z.number().min(0).max(1)).default({}),
  mood_tendency: z.string().nullable().default(null),
  new_directives: z.array(z.string()).default([]),
  transition: TransitionConditionSchema,
  duration_estimate_days: z.number().nullable().default(null),
})

export const ArcSchema = z.object({
  id: z.string().startsWith('arc-'),
  entity_id: z.string().startsWith('e-'),
  name: z.string(),
  status: ArcStatusSchema.default('Planned'),
  phases: z.array(ArcPhaseSchema).min(1),
  current_phase: z.number().int().min(0).default(0),
  pre_arc_snapshot_id: z.string().startsWith('snap-').nullable().default(null),
  rollback_policy: RollbackPolicySchema.default('AutoOnAbort'),
  created_at: z.string(),
  started_at: z.string().nullable().default(null),
  completed_at: z.string().nullable().default(null),
})

export type ArcStatus = z.infer<typeof ArcStatusSchema>
export type RollbackPolicy = z.infer<typeof RollbackPolicySchema>
export type TransitionConditionType = z.infer<typeof TransitionConditionTypeSchema>
export type TransitionCondition = z.infer<typeof TransitionConditionSchema>
export type ArcPhase = z.infer<typeof ArcPhaseSchema>
export type Arc = z.infer<typeof ArcSchema>
