import { z } from 'zod'

export const RelationshipTargetTypeSchema = z.enum(['Entity', 'User', 'UserClass'])

export const RelationshipRuleSchema = z.object({
  trigger: z.string(),
  effect: z.string(),
  bounds: z.string().default(''),
  cooldown_hours: z.number().default(24),
})

export const RelationshipSchema = z.object({
  id: z.string().startsWith('rel-'),
  entity_id: z.string().startsWith('e-'),
  target_id: z.string(),
  target_type: RelationshipTargetTypeSchema,
  label: z.string(),
  sentiment: z.number().min(-1).max(1).default(0),
  trust: z.number().min(0).max(1).default(0.5),
  familiarity: z.number().min(0).max(1).default(0),
  interaction_count: z.number().int().default(0),
  last_interaction: z.string().nullable().default(null),
  dynamic_rules: z.array(RelationshipRuleSchema).default([]),
  history_summary: z.string().default(''),
  created_at: z.string(),
})

export type RelationshipTargetType = z.infer<typeof RelationshipTargetTypeSchema>
export type RelationshipRule = z.infer<typeof RelationshipRuleSchema>
export type Relationship = z.infer<typeof RelationshipSchema>
