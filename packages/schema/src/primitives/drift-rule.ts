import { z } from 'zod'

export const DriftDirectionTypeSchema = z.enum(['TowardValue', 'TowardInteractions', 'RandomWalk', 'Decay'])

export const DriftDirectionSchema = z.object({
  type: DriftDirectionTypeSchema,
  target: z.number().min(0).max(1).nullable().default(null),
  bias: z.number().min(-1).max(1).nullable().default(null),
})

export const DriftTriggerSchema = z.object({
  event: z.string(),
  multiplier: z.number().default(1.0),
  direction_override: DriftDirectionSchema.nullable().default(null),
  cooldown_hours: z.number().default(24),
})

export const DriftRuleSchema = z.object({
  id: z.string().startsWith('drift-'),
  entity_id: z.string().startsWith('e-'),
  trait_name: z.string(),
  rate: z.number().min(0).max(0.5),
  period_hours: z.number().min(1).default(168), // 1 week
  direction: DriftDirectionSchema,
  triggers: z.array(DriftTriggerSchema).default([]),
  bounds: z.object({
    min: z.number().min(0).max(1),
    max: z.number().min(0).max(1),
  }),
  is_active: z.boolean().default(true),
  last_applied: z.string().nullable().default(null),
  created_at: z.string(),
}).refine(
  data => data.bounds.min <= data.bounds.max,
  { message: 'DriftRule bounds.min must be <= bounds.max' },
)

export type DriftDirectionType = z.infer<typeof DriftDirectionTypeSchema>
export type DriftDirection = z.infer<typeof DriftDirectionSchema>
export type DriftTrigger = z.infer<typeof DriftTriggerSchema>
export type DriftRule = z.infer<typeof DriftRuleSchema>
